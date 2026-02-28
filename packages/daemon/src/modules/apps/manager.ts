import { nanoid } from 'nanoid';
import { rmSync, existsSync } from 'fs';
import { join } from 'path';
import type { Workspace, AppState } from '../../core/workspace';
import { hashApiKey } from '../../core/auth';
import {
  NotFoundError,
  AlreadyExistsError,
  InvalidNameError,
  VersionConflictError,
  ImmutableFileError,
  BadRequestError,
} from '../../core/errors';

// --- Types ---

const APP_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/** Validate that a file path is safe (no traversal, no absolute paths) */
function assertSafeFilePath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new BadRequestError('File path is required');
  }
  if (filePath.startsWith('/') || filePath.includes('\\') || filePath.includes('\0')) {
    throw new BadRequestError(`Unsafe file path: '${filePath}'`);
  }
  const segments = filePath.split('/');
  if (segments.some(s => s === '..' || s === '.' || s === '')) {
    throw new BadRequestError(`Unsafe file path: '${filePath}'`);
  }
}

export interface App {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
}

export interface AppFile {
  path: string;
  content: string;
  immutable: boolean;
}

export interface AppWithFiles {
  name: string;
  description: string;
  current_version: number;
  published_version: number;
  state: AppState | 'unknown';
  files: AppFile[];
}

export interface CreateAppResult {
  app: AppWithFiles;
  apiKey: string; // plain text, shown only once
}

// Template function file content
const TEMPLATE_FUNCTION = `import type { FunctionContext } from 'cozybase';

export async function GET(ctx: FunctionContext) {
  return { message: 'Hello from CozyBase!' };
}
`;

// --- AppManager ---

export class AppManager {
  constructor(private workspace: Workspace) {}

  /** List all apps (basic info, no files) */
  list(): (App & { state: AppState | 'unknown'; has_ui: boolean })[] {
    const db = this.workspace.getPlatformDb();
    const apps = db.query(
      "SELECT name, description, status, current_version, published_version, created_at, updated_at FROM apps WHERE status != 'deleted' ORDER BY created_at DESC",
    ).all() as App[];

    // Batch-check which apps have ui/pages.json
    const uiFiles = db.query(
      "SELECT DISTINCT app_name FROM app_files WHERE path = 'ui/pages.json'",
    ).all() as { app_name: string }[];
    const appsWithUi = new Set(uiFiles.map((f) => f.app_name));

    return apps.map((app) => ({
      ...app,
      state: this.workspace.getAppState(app.name) ?? 'unknown' as const,
      has_ui: appsWithUi.has(app.name),
    }));
  }

  /** Get a single app's basic info */
  get(name: string): App {
    const db = this.workspace.getPlatformDb();
    const app = db.query(
      'SELECT name, description, status, current_version, published_version, created_at, updated_at FROM apps WHERE name = ?',
    ).get(name) as App | null;
    if (!app) throw new NotFoundError(`App '${name}' not found`);
    return app;
  }

  /** Get a single app with all its files */
  getAppWithFiles(name: string): AppWithFiles {
    const app = this.get(name);
    const db = this.workspace.getPlatformDb();

    const files = db.query(
      'SELECT path, content, immutable FROM app_files WHERE app_name = ? ORDER BY path',
    ).all(name) as { path: string; content: string; immutable: number }[];

    return {
      name: app.name,
      description: app.description,
      current_version: app.current_version,
      published_version: app.published_version,
      state: this.workspace.getAppState(name) ?? 'unknown',
      files: files.map((f) => ({
        path: f.path,
        content: f.content,
        immutable: f.immutable === 1,
      })),
    };
  }

  /** Create a new app with template files */
  create(name: string, description = ''): CreateAppResult {
    // Validate name
    if (!APP_NAME_PATTERN.test(name)) {
      throw new InvalidNameError(`Invalid app name '${name}'. Must match ${APP_NAME_PATTERN}`);
    }
    if (name.startsWith('_')) {
      throw new InvalidNameError(`Invalid app name '${name}'. App names cannot start with '_'`);
    }

    const db = this.workspace.getPlatformDb();

    // Check name uniqueness
    const existing = db.query('SELECT name FROM apps WHERE name = ?').get(name);
    if (existing) {
      throw new AlreadyExistsError(`App with name '${name}' already exists`);
    }

    // Wrap all writes in a transaction
    db.exec('BEGIN');
    try {
      // Create app record with version = 1
      db.query(
        'INSERT INTO apps (name, description, current_version, published_version) VALUES (?, ?, 1, 0)',
      ).run(name, description);

      // Create template files in app_files
      const templateFiles = [
        { path: 'app.yaml', content: `description: ${description}\n` },
        { path: 'migrations/001_init.sql', content: '-- Write your first migration here\n' },
        { path: 'functions/hello.ts', content: TEMPLATE_FUNCTION },
      ];

      for (const file of templateFiles) {
        db.query(
          'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
        ).run(name, file.path, file.content);
      }

      // Generate a default service API key
      const rawKey = `cb_${nanoid(32)}`;
      const keyId = nanoid(12);
      db.query(
        'INSERT INTO api_keys (id, app_name, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      ).run(keyId, name, hashApiKey(rawKey), 'Default Service Key', 'service');

      db.exec('COMMIT');

      // Refresh app state cache
      this.workspace.refreshAppState(name);

      const appWithFiles = this.getAppWithFiles(name);
      return { app: appWithFiles, apiKey: rawKey };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Whole-app update with optimistic locking */
  updateApp(
    name: string,
    files: { path: string; content: string }[],
    baseVersion: number,
  ): AppWithFiles {
    const db = this.workspace.getPlatformDb();

    // Validate all file entries before any DB work
    for (const file of files) {
      if (!file || typeof file !== 'object') {
        throw new BadRequestError('Each entry in "files" must be an object with "path" and "content"');
      }
      if (typeof file.path !== 'string' || typeof file.content !== 'string') {
        throw new BadRequestError('Each entry in "files" must have a string "path" and string "content"');
      }
      assertSafeFilePath(file.path);
    }

    // Check app exists and verify version
    const app = db.query(
      'SELECT current_version FROM apps WHERE name = ?',
    ).get(name) as { current_version: number } | null;

    if (!app) throw new NotFoundError(`App '${name}' not found`);

    if (app.current_version !== baseVersion) {
      throw new VersionConflictError(
        `Version conflict: expected ${baseVersion}, current is ${app.current_version}. Please fetch and retry.`,
      );
    }

    // Get current files from DB
    const currentFiles = db.query(
      'SELECT path, content, immutable FROM app_files WHERE app_name = ?',
    ).all(name) as { path: string; content: string; immutable: number }[];

    const currentFileMap = new Map(currentFiles.map((f) => [f.path, f]));
    const requestedPaths = new Set(files.map((f) => f.path));

    // Validate immutable files: cannot modify content
    for (const file of files) {
      const current = currentFileMap.get(file.path);
      if (current && current.immutable === 1 && current.content !== file.content) {
        throw new ImmutableFileError(
          `Cannot modify immutable file '${file.path}'. Already-published migrations are immutable.`,
        );
      }
    }

    // Process changes in a transaction
    db.exec('BEGIN');
    try {
      // Delete non-immutable files that are not in the request
      for (const current of currentFiles) {
        if (!requestedPaths.has(current.path) && current.immutable !== 1) {
          db.query('DELETE FROM app_files WHERE app_name = ? AND path = ?').run(name, current.path);
        }
      }

      // Upsert requested files
      for (const file of files) {
        const current = currentFileMap.get(file.path);
        if (!current) {
          // New file
          db.query(
            'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
          ).run(name, file.path, file.content);
        } else if (current.content !== file.content && current.immutable !== 1) {
          // Modified non-immutable file
          db.query(
            "UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_name = ? AND path = ?",
          ).run(file.content, name, file.path);
        }
        // Immutable files with same content: skip
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
    return this.getAppWithFiles(name);
  }

  /** Single file update (no version lock needed) */
  updateFile(name: string, path: string, content: string): AppFile {
    assertSafeFilePath(path);
    const db = this.workspace.getPlatformDb();

    // Check app exists
    const app = db.query('SELECT name FROM apps WHERE name = ?').get(name);
    if (!app) throw new NotFoundError(`App '${name}' not found`);

    // Check immutability
    const existing = db.query(
      'SELECT immutable, content FROM app_files WHERE app_name = ? AND path = ?',
    ).get(name, path) as { immutable: number; content: string } | null;

    if (existing && existing.immutable === 1 && existing.content !== content) {
      throw new ImmutableFileError(
        `Cannot modify immutable file '${path}'. Already-published migrations are immutable.`,
      );
    }

    // UPSERT
    db.query(`
      INSERT INTO app_files (app_name, path, content)
      VALUES (?, ?, ?)
      ON CONFLICT(app_name, path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
    `).run(name, path, content);

    // Increment version
    db.query(
      "UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE name = ?",
    ).run(name);

    this.workspace.refreshAppState(name);

    const immutable = existing?.immutable === 1;
    return { path, content, immutable };
  }

  /** Delete an app entirely */
  delete(name: string): void {
    this.get(name); // throws if not found

    // Remove from workspace caches (also closes DB connections)
    this.workspace.removeApp(name);

    // Remove platform records (CASCADE will handle app_files and api_keys)
    const db = this.workspace.getPlatformDb();
    db.query('DELETE FROM api_keys WHERE app_name = ?').run(name);
    db.query('DELETE FROM apps WHERE name = ?').run(name);

    // Remove app data directory (stable DB + functions)
    const appDataDir = join(this.workspace.stableDir, name);
    if (existsSync(appDataDir)) {
      rmSync(appDataDir, { recursive: true, force: true });
    }

    // Remove draft data directory (draft DB + functions)
    const draftDataDir = join(this.workspace.draftDir, name);
    if (existsSync(draftDataDir)) {
      rmSync(draftDataDir, { recursive: true, force: true });
    }
  }

  /** Update app metadata (description, status) */
  update(name: string, data: { description?: string; status?: string }): App {
    const app = this.get(name);
    const db = this.workspace.getPlatformDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      values.push(data.status);
    }

    if (fields.length === 0) return app;

    fields.push("updated_at = datetime('now')");
    values.push(name);

    db.query(`UPDATE apps SET ${fields.join(', ')} WHERE name = ?`).run(...values);
    this.workspace.refreshAppState(name);
    return this.get(name);
  }
}
