import { nanoid } from 'nanoid';
import { rmSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import type { Workspace, AppStateInfo, StableStatus } from '../../core/workspace';
import { hashApiKey } from '../../core/auth';
import {
  NotFoundError,
  AlreadyExistsError,
  InvalidNameError,
  VersionConflictError,
  ImmutableFileError,
  BadRequestError,
} from '../../core/errors';
import type { AppRegistry, AppMode } from '@cozybase/runtime';

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
  stableStatus: StableStatus | null;
  hasDraft: boolean;
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
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
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

/** Callback to clean up agent sessions when apps are deleted/renamed */
export interface SessionCleanup {
  remove(appName: string): void;
}

// --- AppManager ---

export class AppManager {
  private sessionCleanup: SessionCleanup | null = null;

  constructor(
    private workspace: Workspace,
    private registry?: AppRegistry,
  ) {}

  /** Set the session cleanup handler (called by server.ts after ChatSessionManager is created) */
  setSessionCleanup(cleanup: SessionCleanup): void {
    this.sessionCleanup = cleanup;
  }

  /** List apps (basic info, no files), optionally filtered by mode */
  list(mode?: AppMode): (App & { has_ui: boolean })[] {
    const db = this.workspace.getPlatformDb();
    const apps = db.query(
      'SELECT name, description, stable_status, current_version, published_version, created_at, updated_at FROM apps ORDER BY created_at DESC',
    ).all() as AppRecord[];

    // Batch-check which apps have ui/pages.json
    const uiFiles = db.query(
      "SELECT DISTINCT app_name FROM app_files WHERE path = 'ui/pages.json'",
    ).all() as { app_name: string }[];
    const appsWithUi = new Set(uiFiles.map((f) => f.app_name));

    const summaries = apps.map((app) => ({
      ...this.toApp(app),
      has_ui: appsWithUi.has(app.name),
    }));

    if (!mode) {
      return summaries;
    }

    return summaries.filter((app) => (
      mode === 'stable'
        ? app.stableStatus !== null
        : app.hasDraft
    ));
  }

  /** Get a single app's basic info */
  get(name: string): App {
    const db = this.workspace.getPlatformDb();
    const app = db.query(
      'SELECT name, description, stable_status, current_version, published_version, created_at, updated_at FROM apps WHERE name = ?',
    ).get(name) as AppRecord | null;
    if (!app) throw new NotFoundError(`App '${name}' not found`);
    return this.toApp(app);
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
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
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
      this.ensureDraftRuntime(name);

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
    this.ensureDraftRuntime(name);
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
    this.ensureDraftRuntime(name);

    const immutable = existing?.immutable === 1;
    return { path, content, immutable };
  }

  /** Delete an app entirely */
  delete(name: string): void {
    const app = this.get(name);
    if (app.stableStatus === 'running') {
      throw new BadRequestError(`App '${name}' must be stopped before deletion`);
    }

    if (this.registry) {
      try {
        this.registry.stop(name, 'stable');
      } catch {
        // Ignore if the runtime was not running.
      }
      try {
        this.registry.stop(name, 'draft');
      } catch {
        // Ignore if the runtime was not running.
      }
    }

    // Clean up in-memory chat session (DB rows cascade-delete via FK)
    this.sessionCleanup?.remove(name);

    // Remove from workspace caches (also closes DB connections)
    this.workspace.removeApp(name);

    // Remove platform records (CASCADE handles dependent app_files and api_keys rows)
    const db = this.workspace.getPlatformDb();
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

  /** Update app metadata (description only) */
  update(name: string, data: { description?: string }): App {
    const app = this.get(name);
    const db = this.workspace.getPlatformDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }

    if (fields.length === 0) return app;

    fields.push("updated_at = datetime('now')");
    values.push(name);

    db.query(`UPDATE apps SET ${fields.join(', ')} WHERE name = ?`).run(...values);
    this.workspace.refreshAppState(name);
    return this.get(name);
  }

  startStable(name: string): App {
    const app = this.get(name);
    if (app.stableStatus === null) {
      throw new BadRequestError(`App '${name}' has no stable version to start`);
    }
    if (app.stableStatus === 'running') {
      return app;
    }

    const db = this.workspace.getPlatformDb();
    db.query(
      "UPDATE apps SET stable_status = 'running', updated_at = datetime('now') WHERE name = ?",
    ).run(name);
    this.workspace.refreshAppState(name);

    const appContext = this.workspace.getOrCreateApp(name);
    if (this.registry && appContext) {
      const existing = this.registry.get(name, 'stable');
      if (existing?.status === 'running') {
        this.registry.restart(name, this.getRuntimeConfig(name, 'stable'));
      } else {
        this.registry.start(name, this.getRuntimeConfig(name, 'stable'));
      }
    }

    return this.get(name);
  }

  stopStable(name: string): App {
    const app = this.get(name);
    if (app.stableStatus === null) {
      throw new BadRequestError(`App '${name}' has no stable version to stop`);
    }
    if (app.stableStatus === 'stopped') {
      return app;
    }

    const db = this.workspace.getPlatformDb();
    db.query(
      "UPDATE apps SET stable_status = 'stopped', updated_at = datetime('now') WHERE name = ?",
    ).run(name);
    this.workspace.refreshAppState(name);

    if (this.registry) {
      try {
        this.registry.stop(name, 'stable');
      } catch {
        // Ignore if the runtime was not running.
      }
    }

    return this.get(name);
  }

  rename(oldName: string, newName: string): AppWithFiles {
    const app = this.get(oldName);
    if (app.stableStatus === 'running') {
      throw new BadRequestError(`App '${oldName}' must be stopped before renaming`);
    }

    if (oldName === newName) {
      return this.getAppWithFiles(oldName);
    }

    if (!APP_NAME_PATTERN.test(newName)) {
      throw new InvalidNameError(`Invalid app name '${newName}'. Must match ${APP_NAME_PATTERN}`);
    }
    if (newName.startsWith('_')) {
      throw new InvalidNameError(`Invalid app name '${newName}'. App names cannot start with '_'`);
    }

    const db = this.workspace.getPlatformDb();
    const existing = db.query('SELECT name FROM apps WHERE name = ?').get(newName);
    if (existing) {
      throw new AlreadyExistsError(`App with name '${newName}' already exists`);
    }

    const oldContext = this.workspace.getOrCreateApp(oldName);
    oldContext?.close();

    const oldDraftWasRunning = this.registry?.get(oldName, 'draft')?.status === 'running';
    const oldStableWasRunning = this.registry?.get(oldName, 'stable')?.status === 'running';

    if (this.registry && oldDraftWasRunning) {
      this.registry.stop(oldName, 'draft');
    }
    if (this.registry && oldStableWasRunning) {
      this.registry.stop(oldName, 'stable');
    }

    const oldStableDir = join(this.workspace.stableDir, oldName);
    const newStableDir = join(this.workspace.stableDir, newName);
    const oldDraftDir = join(this.workspace.draftDir, oldName);
    const newDraftDir = join(this.workspace.draftDir, newName);

    if (existsSync(newStableDir) || existsSync(newDraftDir)) {
      throw new AlreadyExistsError(`Filesystem data for app '${newName}' already exists`);
    }

    let stableDirRenamed = false;
    let draftDirRenamed = false;

    db.exec('BEGIN');
    try {
      db.query(`
        INSERT INTO apps (
          name,
          description,
          stable_status,
          current_version,
          published_version,
          created_at,
          updated_at
        )
        SELECT
          ?,
          description,
          stable_status,
          current_version,
          published_version,
          created_at,
          datetime('now')
        FROM apps
        WHERE name = ?
      `).run(newName, oldName);

      db.query('UPDATE app_files SET app_name = ? WHERE app_name = ?').run(newName, oldName);
      db.query('UPDATE api_keys SET app_name = ? WHERE app_name = ?').run(newName, oldName);
      db.query('UPDATE agent_sessions SET app_name = ? WHERE app_name = ?').run(newName, oldName);
      db.query('UPDATE agent_messages SET app_name = ? WHERE app_name = ?').run(newName, oldName);
      db.query('DELETE FROM apps WHERE name = ?').run(oldName);

      if (existsSync(oldStableDir)) {
        renameSync(oldStableDir, newStableDir);
        stableDirRenamed = true;
      }
      if (existsSync(oldDraftDir)) {
        renameSync(oldDraftDir, newDraftDir);
        draftDirRenamed = true;
      }

      db.exec('COMMIT');
    } catch (err) {
      if (draftDirRenamed && existsSync(newDraftDir)) {
        renameSync(newDraftDir, oldDraftDir);
      }
      if (stableDirRenamed && existsSync(newStableDir)) {
        renameSync(newStableDir, oldStableDir);
      }
      db.exec('ROLLBACK');
      throw err;
    }

    this.sessionCleanup?.remove(oldName);
    this.workspace.removeApp(oldName);
    this.workspace.refreshAppState(newName);
    this.ensureDraftRuntime(newName);

    return this.getAppWithFiles(newName);
  }

  private ensureDraftRuntime(name: string): void {
    if (!this.registry) return;

    const state = this.workspace.getAppState(name) ?? this.workspace.refreshAppState(name);
    if (!state?.hasDraft) return;

    const existing = this.registry.get(name, 'draft');
    if (existing?.status === 'running') return;

    if (existing) {
      this.registry.restart(name, this.getRuntimeConfig(name, 'draft'));
      return;
    }

    this.registry.start(name, this.getRuntimeConfig(name, 'draft'));
  }

  private getStateInfo(name: string): AppStateInfo {
    const state = this.workspace.getAppState(name) ?? this.workspace.refreshAppState(name);
    if (!state) {
      throw new NotFoundError(`App '${name}' not found`);
    }
    return state;
  }

  private getRuntimeConfig(name: string, mode: AppMode) {
    const appContext = this.workspace.getOrCreateApp(name);
    if (!appContext) {
      throw new NotFoundError(`App '${name}' not found`);
    }

    if (mode === 'stable') {
      return {
        mode,
        dbPath: appContext.stableDbPath,
        functionsDir: join(appContext.stableDataDir, 'functions'),
        uiDir: join(appContext.stableDataDir, 'ui'),
      };
    }

    return {
      mode,
      dbPath: appContext.draftDbPath,
      functionsDir: join(appContext.draftDataDir, 'functions'),
      uiDir: join(appContext.draftDataDir, 'ui'),
    };
  }

  private toApp(app: AppRecord): App {
    const state = this.getStateInfo(app.name);
    return {
      name: app.name,
      description: app.description,
      stableStatus: state.stableStatus,
      hasDraft: state.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
      created_at: app.created_at,
      updated_at: app.updated_at,
    };
  }
}

interface AppRecord {
  name: string;
  description: string;
  stable_status: StableStatus | null;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
}
