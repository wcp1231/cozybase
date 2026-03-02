/**
 * LocalBackend — In-process CozybaseBackend implementation.
 *
 * Directly calls Workspace, AppManager, DraftReconciler, Verifier, Publisher,
 * and UiBridge without HTTP roundtrips. Used by the SDK MCP Server running
 * inside the daemon process.
 */

import { join } from 'path';
import type { Hono } from 'hono';
import type { Workspace } from '../core/workspace';
import type { DraftReconciler } from '../core/draft-reconciler';
import type { Verifier } from '../core/verifier';
import type { Publisher } from '../core/publisher';
import type { UiBridge } from '../core/ui-bridge';
import { type AppRegistry, validateSql, type SqlMode } from '@cozybase/runtime';
import type { AppManager } from '../modules/apps/manager';
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
} from '../mcp/types';

export interface LocalBackendDeps {
  workspace: Workspace;
  appManager: AppManager;
  draftReconciler: DraftReconciler;
  verifier: Verifier;
  publisher: Publisher;
  registry: AppRegistry;
  uiBridge: UiBridge;
  honoApp: Hono;
}

export class LocalBackend implements CozybaseBackend {
  private workspace: Workspace;
  private appManager: AppManager;
  private draftReconciler: DraftReconciler;
  private verifier: Verifier;
  private publisher: Publisher;
  private registry: AppRegistry;
  private uiBridge: UiBridge;
  private honoApp: Hono;

  constructor(deps: LocalBackendDeps) {
    this.workspace = deps.workspace;
    this.appManager = deps.appManager;
    this.draftReconciler = deps.draftReconciler;
    this.verifier = deps.verifier;
    this.publisher = deps.publisher;
    this.registry = deps.registry;
    this.uiBridge = deps.uiBridge;
    this.honoApp = deps.honoApp;
  }

  // --- App Lifecycle ---

  async createApp(name: string, description?: string): Promise<AppSnapshot> {
    const result = this.appManager.create(name, description);
    const app = result.app;
    return {
      name: app.name,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
      files: app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async listApps(): Promise<AppInfo[]> {
    const apps = this.appManager.list();
    return apps.map((a) => ({
      name: a.name,
      description: a.description,
      stableStatus: a.stableStatus,
      hasDraft: a.hasDraft,
      current_version: a.current_version,
      published_version: a.published_version,
    }));
  }

  async fetchApp(name: string): Promise<AppSnapshot> {
    const app = this.appManager.getAppWithFiles(name);
    return {
      name: app.name,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
      files: app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async deleteApp(name: string): Promise<void> {
    this.appManager.delete(name);
  }

  async startApp(name: string): Promise<AppInfo> {
    const app = this.appManager.startStable(name);
    return {
      name: app.name,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
    };
  }

  async stopApp(name: string): Promise<AppInfo> {
    const app = this.appManager.stopStable(name);
    return {
      name: app.name,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
    };
  }

  // --- File Sync ---

  async pushFiles(name: string, files: FileEntry[]): Promise<PushResult> {
    // Fetch current version for optimistic lock
    const current = this.appManager.getAppWithFiles(name);
    const updatedApp = this.appManager.updateApp(
      name,
      files.map((f) => ({ path: f.path, content: f.content })),
      current.current_version,
    );

    // Compute changes by comparing old and new file sets
    const oldPaths = new Set(current.files.map((f) => f.path));
    const newPaths = new Set(updatedApp.files.map((f) => f.path));
    const oldContentMap = new Map(current.files.map((f) => [f.path, f.content]));

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const f of files) {
      if (!oldPaths.has(f.path)) {
        added.push(f.path);
      } else if (oldContentMap.get(f.path) !== f.content) {
        modified.push(f.path);
      }
    }

    for (const p of oldPaths) {
      if (!newPaths.has(p)) {
        deleted.push(p);
      }
    }

    return {
      files: files.map((f) => f.path),
      changes: { added, modified, deleted },
    };
  }

  async pushFile(name: string, path: string, content: string): Promise<'created' | 'updated'> {
    const current = this.appManager.getAppWithFiles(name);
    const existed = current.files.some((f) => f.path === path);
    this.appManager.updateFile(name, path, content);
    return existed ? 'updated' : 'created';
  }

  // --- Dev Workflow ---

  async reconcile(name: string): Promise<DraftReconcileResult> {
    this.workspace.refreshAppState(name);
    const result = await this.draftReconciler.reconcile(name);

    // Restart draft runtime after reconcile
    const appContext = this.workspace.getOrCreateApp(name);
    if (appContext) {
      this.registry.restart(name, {
        mode: 'draft',
        dbPath: appContext.draftDbPath,
        functionsDir: join(appContext.draftDataDir, 'functions'),
        uiDir: join(appContext.draftDataDir, 'ui'),
      });
    }

    return result;
  }

  async verify(name: string): Promise<VerifyResult> {
    this.workspace.refreshAppState(name);
    return this.verifier.verify(name);
  }

  async publish(name: string): Promise<PublishResult> {
    this.workspace.refreshAppState(name);
    const result = await this.publisher.publish(name);

    if (result.success) {
      this.workspace.refreshAppState(name);
      const state = this.workspace.getAppState(name);
      const appContext = this.workspace.getOrCreateApp(name);

      if (appContext && state?.stableStatus === 'running') {
        this.registry.restart(name, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
      } else {
        try { this.registry.stop(name, 'stable'); } catch { /* ignore */ }
      }

      try { this.registry.stop(name, 'draft'); } catch { /* ignore */ }
    }

    return result;
  }

  // --- Runtime Interaction ---

  async executeSql(name: string, sql: string, mode: string): Promise<SqlResult> {
    const sqlMode: SqlMode = mode === 'stable' ? 'stable' : 'draft';

    // Enforce the same permission model as the HTTP route:
    // - Stable: SELECT only
    // - Draft: SELECT + DML
    // - DDL always forbidden
    // - Multi-statement always forbidden
    const check = validateSql(sql, sqlMode);
    if (!check.allowed) {
      throw new Error(check.error ?? 'SQL statement not allowed');
    }

    // Use read-only lookup — never lazily create databases for a query
    const appContext = this.workspace.getApp(name);
    if (!appContext) {
      throw new Error(`App '${name}' not found`);
    }

    const db = sqlMode === 'stable' ? appContext.stableDb : appContext.draftDb;

    const stmt = db.query(sql);
    const rows = stmt.all() as Record<string, unknown>[];

    if (rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    const columns = Object.keys(rows[0]);
    const limitedRows = rows.slice(0, 1000);
    return {
      columns,
      rows: limitedRows.map((row) => columns.map((col) => row[col])),
      rowCount: rows.length,
    };
  }

  async callApi(
    name: string,
    method: string,
    path: string,
    body?: unknown,
    mode?: string,
  ): Promise<ApiResponse> {
    // Route through the Hono app internally (no network)
    const appMode = mode === 'stable' ? 'stable' : 'draft';
    const reqPath = `/${appMode}/apps/${encodeURIComponent(name)}${path}`;
    const url = `http://localhost${reqPath}`;

    const init: RequestInit = { method: method.toUpperCase() };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    const response = await this.honoApp.request(url, init);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

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

  // --- UI Inspection ---

  async inspectUi(appName: string, page?: string): Promise<unknown> {
    return this.uiBridge.inspectUi(appName, page);
  }
}
