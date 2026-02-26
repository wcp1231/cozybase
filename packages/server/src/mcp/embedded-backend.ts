/**
 * EmbeddedBackend — Local mode implementation of CozybaseBackend.
 *
 * Directly calls cozybase internal modules (AppManager, DraftReconciler, etc.)
 * without any network overhead. Used when cozybase runs on the same machine.
 */

import type { Hono } from 'hono';
import type { Workspace } from '../core/workspace';
import type { DraftReconciler } from '../core/draft-reconciler';
import type { Verifier } from '../core/verifier';
import type { Publisher } from '../core/publisher';
import { AppManager } from '../modules/apps/manager';
import { validateSql } from './sql-safety';
import type {
  CozybaseBackend,
  AppSnapshot,
  AppInfo,
  FileEntry,
  PushResult,
  SqlResult,
  ApiResponse,
  DraftReconcileResult,
  VerifyResult,
  PublishResult,
} from './types';

const MAX_ROWS = 1000;
const SQL_TIMEOUT_MS = 5000;

export class EmbeddedBackend implements CozybaseBackend {
  private appManager: AppManager;

  constructor(
    private workspace: Workspace,
    private draftReconciler: DraftReconciler,
    private verifier: Verifier,
    private publisher: Publisher,
    private app: Hono,
  ) {
    this.appManager = new AppManager(workspace);
  }

  // --- App Lifecycle ---

  async createApp(name: string, description?: string): Promise<AppSnapshot> {
    const result = this.appManager.create(name, description ?? '');
    return {
      name: result.app.name,
      description: result.app.description,
      state: result.app.state,
      current_version: result.app.current_version,
      published_version: result.app.published_version,
      files: result.app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async listApps(): Promise<AppInfo[]> {
    const apps = this.appManager.list();
    return apps.map((a) => ({
      name: a.name,
      description: a.description,
      state: a.state,
      current_version: a.current_version,
      published_version: a.published_version,
    }));
  }

  async fetchApp(name: string): Promise<AppSnapshot> {
    const app = this.appManager.getAppWithFiles(name);
    return {
      name: app.name,
      description: app.description,
      state: app.state,
      current_version: app.current_version,
      published_version: app.published_version,
      files: app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async deleteApp(name: string): Promise<void> {
    this.appManager.delete(name);
  }

  // --- File Sync ---

  async pushFiles(name: string, files: FileEntry[]): Promise<PushResult> {
    const db = this.workspace.getPlatformDb();

    // Check app exists
    const app = db.query('SELECT current_version FROM apps WHERE name = ?').get(name) as { current_version: number } | null;
    if (!app) {
      throw new Error(`App '${name}' not found`);
    }

    // Get current files from DB
    const currentFiles = db.query(
      'SELECT path, content, immutable FROM app_files WHERE app_name = ?',
    ).all(name) as { path: string; content: string; immutable: number }[];

    const currentFileMap = new Map(currentFiles.map((f) => [f.path, f]));
    const incomingPaths = new Set(files.map((f) => f.path));

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    // Check immutable file protection
    for (const file of files) {
      const current = currentFileMap.get(file.path);
      if (current && current.immutable === 1 && current.content !== file.content) {
        throw new Error(
          `Cannot modify immutable file '${file.path}'. Already-published migrations are immutable.`,
        );
      }
    }

    db.exec('BEGIN');
    try {
      // Delete non-immutable files missing from incoming set
      for (const current of currentFiles) {
        if (!incomingPaths.has(current.path) && current.immutable !== 1) {
          db.query('DELETE FROM app_files WHERE app_name = ? AND path = ?').run(name, current.path);
          deleted.push(current.path);
        }
      }

      // Upsert incoming files
      for (const file of files) {
        const current = currentFileMap.get(file.path);
        if (!current) {
          db.query(
            'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
          ).run(name, file.path, file.content);
          added.push(file.path);
        } else if (current.content !== file.content && current.immutable !== 1) {
          db.query(
            "UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_name = ? AND path = ?",
          ).run(file.content, name, file.path);
          modified.push(file.path);
        }
      }

      // Increment version
      db.query(
        "UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?",
      ).run(name);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    this.workspace.refreshAppState(name);

    return {
      files: files.map((f) => f.path),
      changes: { added, modified, deleted },
    };
  }

  async pushFile(name: string, path: string, content: string): Promise<'created' | 'updated'> {
    const db = this.workspace.getPlatformDb();
    const existing = db.query(
      'SELECT 1 FROM app_files WHERE app_name = ? AND path = ?',
    ).get(name, path);
    this.appManager.updateFile(name, path, content);
    return existing ? 'updated' : 'created';
  }

  // --- Dev Workflow ---

  async reconcile(name: string): Promise<DraftReconcileResult> {
    return this.draftReconciler.reconcile(name);
  }

  async verify(name: string): Promise<VerifyResult> {
    return this.verifier.verify(name);
  }

  async publish(name: string): Promise<PublishResult> {
    return this.publisher.publish(name);
  }

  // --- Runtime Interaction ---

  async executeSql(name: string, sql: string, mode: string): Promise<SqlResult> {
    const sqlMode = mode === 'stable' ? 'stable' : 'draft';

    // Safety check
    const check = validateSql(sql, sqlMode);
    if (!check.allowed) {
      throw new Error(check.error);
    }

    // Get app context and DB
    this.workspace.refreshAppState(name);
    const appContext = this.workspace.getOrCreateApp(name);
    if (!appContext) {
      throw new Error(`App '${name}' not found`);
    }

    const db = sqlMode === 'stable' ? appContext.stableDb : appContext.draftDb;

    // Execute with timeout via Promise.race.
    // bun:sqlite .all() is synchronous, so the timeout can only fire
    // between the event loop ticks (before/after execution). For truly
    // long-running queries, SQLite's busy_timeout handles lock waits.
    // This guards against the overall handler taking too long.
    const executeQuery = (): SqlResult => {
      const stmt = db.query(sql);
      const rows = stmt.all() as Record<string, unknown>[];

      // Limit rows
      const limitedRows = rows.slice(0, MAX_ROWS);

      // Extract columns from first row (or empty)
      const columns = limitedRows.length > 0
        ? Object.keys(limitedRows[0])
        : [];

      // Convert to array format
      const rowArrays = limitedRows.map((row) =>
        columns.map((col) => row[col]),
      );

      return {
        columns,
        rows: rowArrays,
        rowCount: rowArrays.length,
      };
    };

    const result = await Promise.race([
      new Promise<SqlResult>((resolve, reject) => {
        try {
          resolve(executeQuery());
        } catch (err) {
          reject(err);
        }
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('SQL execution timed out (5s limit)')), SQL_TIMEOUT_MS),
      ),
    ]);

    return result;
  }

  async callApi(
    name: string,
    method: string,
    path: string,
    body?: unknown,
    mode?: string,
  ): Promise<ApiResponse> {
    const appMode = mode === 'stable' ? 'stable' : 'draft';
    const url = `http://localhost/${appMode}/apps/${name}${path}`;

    const init: RequestInit = { method: method.toUpperCase() };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    const response = await this.app.request(url, init);

    // Extract headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse body
    let responseBody: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers,
      body: responseBody,
    };
  }
}
