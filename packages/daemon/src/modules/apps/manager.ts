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
import type { DraftReconciler } from '../../core/draft-reconciler';

// --- Types ---

const APP_SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

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
  slug: string;
  displayName: string;
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
  slug: string;
  displayName: string;
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
  reconcileError?: string; // non-fatal: app created but draft env failed
}

// Template function file content
const TEMPLATE_FUNCTION = `import type { FunctionContext } from 'cozybase';

export async function GET(ctx: FunctionContext) {
  return { message: 'Hello from CozyBase!' };
}
`;

/** Callback to clean up agent sessions when apps are deleted/renamed */
export interface SessionCleanup {
  remove(appSlug: string): void;
}

// --- AppManager ---

export class AppManager {
  private sessionCleanup: SessionCleanup | null = null;

  constructor(
    private workspace: Workspace,
    private registry?: AppRegistry,
    private draftReconciler?: DraftReconciler,
  ) {}

  /** Set the session cleanup handler (called by server.ts after ChatSessionManager is created) */
  setSessionCleanup(cleanup: SessionCleanup): void {
    this.sessionCleanup = cleanup;
  }

  /** Check if a slug exists */
  exists(slug: string): boolean {
    const db = this.workspace.getPlatformDb();
    return !!db.query('SELECT slug FROM apps WHERE slug = ?').get(slug);
  }

  /** List apps (basic info, no files), optionally filtered by mode */
  list(mode?: AppMode): (App & { has_ui: boolean })[] {
    const db = this.workspace.getPlatformDb();
    const apps = db.query(
      'SELECT slug, display_name, description, stable_status, current_version, published_version, created_at, updated_at FROM apps ORDER BY created_at DESC',
    ).all() as AppRecord[];

    // Batch-check which apps have ui/pages.json
    const uiFiles = db.query(
      "SELECT DISTINCT app_slug FROM app_files WHERE path = 'ui/pages.json'",
    ).all() as { app_slug: string }[];
    const appsWithUi = new Set(uiFiles.map((f) => f.app_slug));

    const summaries = apps.map((app) => ({
      ...this.toApp(app),
      has_ui: appsWithUi.has(app.slug),
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
  get(slug: string): App {
    const db = this.workspace.getPlatformDb();
    const app = db.query(
      'SELECT slug, display_name, description, stable_status, current_version, published_version, created_at, updated_at FROM apps WHERE slug = ?',
    ).get(slug) as AppRecord | null;
    if (!app) throw new NotFoundError(`App '${slug}' not found`);
    return this.toApp(app);
  }

  /** Get a single app with all its files */
  getAppWithFiles(slug: string): AppWithFiles {
    const app = this.get(slug);
    const db = this.workspace.getPlatformDb();

    const files = db.query(
      'SELECT path, content, immutable FROM app_files WHERE app_slug = ? ORDER BY path',
    ).all(slug) as { path: string; content: string; immutable: number }[];

    return {
      slug: app.slug,
      displayName: app.displayName,
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
  async create(slug: string, description = '', displayName = ''): Promise<CreateAppResult> {
    // Validate slug
    if (!APP_SLUG_PATTERN.test(slug)) {
      throw new InvalidNameError(`Invalid app slug '${slug}'. Must match ${APP_SLUG_PATTERN}`);
    }
    if (slug.startsWith('_')) {
      throw new InvalidNameError(`Invalid app slug '${slug}'. App slugs cannot start with '_'`);
    }

    const db = this.workspace.getPlatformDb();

    // Check slug uniqueness
    const existing = db.query('SELECT slug FROM apps WHERE slug = ?').get(slug);
    if (existing) {
      throw new AlreadyExistsError(`App with slug '${slug}' already exists`);
    }

    // Wrap all writes in a transaction
    db.exec('BEGIN');
    try {
      // Create app record with version = 1
      db.query(
        'INSERT INTO apps (slug, display_name, description, current_version, published_version) VALUES (?, ?, ?, 1, 0)',
      ).run(slug, displayName, description);

      // Create template files in app_files
      const templateFiles = [
        { path: 'app.yaml', content: `description: ${description}\n` },
        { path: 'functions/hello.ts', content: TEMPLATE_FUNCTION },
      ];

      for (const file of templateFiles) {
        db.query(
          'INSERT INTO app_files (app_slug, path, content) VALUES (?, ?, ?)',
        ).run(slug, file.path, file.content);
      }

      // Generate a default service API key
      const rawKey = `cb_${nanoid(32)}`;
      const keyId = nanoid(12);
      db.query(
        'INSERT INTO api_keys (id, app_slug, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
      ).run(keyId, slug, hashApiKey(rawKey), 'Default Service Key', 'service');

      db.exec('COMMIT');

      // Refresh app state cache
      this.workspace.refreshAppState(slug);

      // Auto-reconcile to initialize Draft environment (creates draft DB, functions, UI)
      let reconcileError: string | undefined;
      if (this.draftReconciler) {
        try {
          const reconcileResult = await this.draftReconciler.reconcile(slug);
          if (!reconcileResult.success) {
            reconcileError = reconcileResult.error ?? 'Draft reconcile failed';
            console.error(`Auto-reconcile failed for '${slug}': ${reconcileError}`);
          }
        } catch (err) {
          reconcileError = err instanceof Error ? err.message : String(err);
          console.error(`Auto-reconcile failed for '${slug}':`, err);
        }
      }

      // Start draft runtime (now with reconciled state)
      this.ensureDraftRuntime(slug);

      const appWithFiles = this.getAppWithFiles(slug);
      return { app: appWithFiles, apiKey: rawKey, reconcileError };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /** Whole-app update with optimistic locking */
  updateApp(
    slug: string,
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
      'SELECT current_version FROM apps WHERE slug = ?',
    ).get(slug) as { current_version: number } | null;

    if (!app) throw new NotFoundError(`App '${slug}' not found`);

    if (app.current_version !== baseVersion) {
      throw new VersionConflictError(
        `Version conflict: expected ${baseVersion}, current is ${app.current_version}. Please fetch and retry.`,
      );
    }

    // Get current files from DB
    const currentFiles = db.query(
      'SELECT path, content, immutable FROM app_files WHERE app_slug = ?',
    ).all(slug) as { path: string; content: string; immutable: number }[];

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
          db.query('DELETE FROM app_files WHERE app_slug = ? AND path = ?').run(slug, current.path);
        }
      }

      // Upsert requested files
      for (const file of files) {
        const current = currentFileMap.get(file.path);
        if (!current) {
          // New file
          db.query(
            'INSERT INTO app_files (app_slug, path, content) VALUES (?, ?, ?)',
          ).run(slug, file.path, file.content);
        } else if (current.content !== file.content && current.immutable !== 1) {
          // Modified non-immutable file
          db.query(
            "UPDATE app_files SET content = ?, updated_at = datetime('now') WHERE app_slug = ? AND path = ?",
          ).run(file.content, slug, file.path);
        }
        // Immutable files with same content: skip
      }

      // Increment version
      db.query(
        "UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE slug = ?",
      ).run(slug);

      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }

    this.workspace.refreshAppState(slug);
    this.ensureDraftRuntime(slug);
    return this.getAppWithFiles(slug);
  }

  /** Single file update (no version lock needed) */
  updateFile(slug: string, path: string, content: string): AppFile {
    assertSafeFilePath(path);
    const db = this.workspace.getPlatformDb();

    // Check app exists
    const app = db.query('SELECT slug FROM apps WHERE slug = ?').get(slug);
    if (!app) throw new NotFoundError(`App '${slug}' not found`);

    // Check immutability
    const existing = db.query(
      'SELECT immutable, content FROM app_files WHERE app_slug = ? AND path = ?',
    ).get(slug, path) as { immutable: number; content: string } | null;

    if (existing && existing.immutable === 1 && existing.content !== content) {
      throw new ImmutableFileError(
        `Cannot modify immutable file '${path}'. Already-published migrations are immutable.`,
      );
    }

    // UPSERT
    db.query(`
      INSERT INTO app_files (app_slug, path, content)
      VALUES (?, ?, ?)
      ON CONFLICT(app_slug, path) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
    `).run(slug, path, content);

    // Increment version
    db.query(
      "UPDATE apps SET current_version = current_version + 1, updated_at = datetime('now') WHERE slug = ?",
    ).run(slug);

    this.workspace.refreshAppState(slug);
    this.ensureDraftRuntime(slug);

    const immutable = existing?.immutable === 1;
    return { path, content, immutable };
  }

  /** Delete an app entirely */
  delete(slug: string): void {
    const app = this.get(slug);
    if (app.stableStatus === 'running') {
      throw new BadRequestError(`App '${slug}' must be stopped before deletion`);
    }

    if (this.registry) {
      try {
        this.registry.stop(slug, 'stable');
      } catch {
        // Ignore if the runtime was not running.
      }
      try {
        this.registry.stop(slug, 'draft');
      } catch {
        // Ignore if the runtime was not running.
      }
    }

    // Clean up in-memory chat session (DB rows cascade-delete via FK)
    this.sessionCleanup?.remove(slug);

    // Remove from workspace caches (also closes DB connections)
    this.workspace.removeApp(slug);

    // Remove platform records (CASCADE handles dependent app_files and api_keys rows)
    const db = this.workspace.getPlatformDb();
    db.query('DELETE FROM apps WHERE slug = ?').run(slug);

    // Remove app data directory (stable DB + functions)
    const appDataDir = join(this.workspace.stableDir, slug);
    if (existsSync(appDataDir)) {
      rmSync(appDataDir, { recursive: true, force: true });
    }

    // Remove draft data directory (draft DB + functions)
    const draftDataDir = join(this.workspace.draftDir, slug);
    if (existsSync(draftDataDir)) {
      rmSync(draftDataDir, { recursive: true, force: true });
    }
  }

  /** Update app metadata (description only) */
  update(slug: string, data: { description?: string }): App {
    const app = this.get(slug);
    const db = this.workspace.getPlatformDb();

    const fields: string[] = [];
    const values: any[] = [];

    if (data.description !== undefined) {
      fields.push('description = ?');
      values.push(data.description);
    }

    if (fields.length === 0) return app;

    fields.push("updated_at = datetime('now')");
    values.push(slug);

    db.query(`UPDATE apps SET ${fields.join(', ')} WHERE slug = ?`).run(...values);
    this.workspace.refreshAppState(slug);
    return this.get(slug);
  }

  startStable(slug: string): App {
    const app = this.get(slug);
    if (app.stableStatus === null) {
      throw new BadRequestError(`App '${slug}' has no stable version to start`);
    }
    if (app.stableStatus === 'running') {
      return app;
    }

    const db = this.workspace.getPlatformDb();
    db.query(
      "UPDATE apps SET stable_status = 'running', updated_at = datetime('now') WHERE slug = ?",
    ).run(slug);
    this.workspace.refreshAppState(slug);

    const appContext = this.workspace.getOrCreateApp(slug);
    if (this.registry && appContext) {
      const existing = this.registry.get(slug, 'stable');
      if (existing?.status === 'running') {
        this.registry.restart(slug, this.getRuntimeConfig(slug, 'stable'));
      } else {
        this.registry.start(slug, this.getRuntimeConfig(slug, 'stable'));
      }
    }

    return this.get(slug);
  }

  stopStable(slug: string): App {
    const app = this.get(slug);
    if (app.stableStatus === null) {
      throw new BadRequestError(`App '${slug}' has no stable version to stop`);
    }
    if (app.stableStatus === 'stopped') {
      return app;
    }

    const db = this.workspace.getPlatformDb();
    db.query(
      "UPDATE apps SET stable_status = 'stopped', updated_at = datetime('now') WHERE slug = ?",
    ).run(slug);
    this.workspace.refreshAppState(slug);

    if (this.registry) {
      try {
        this.registry.stop(slug, 'stable');
      } catch {
        // Ignore if the runtime was not running.
      }
    }

    return this.get(slug);
  }

  rename(oldSlug: string, newSlug: string): AppWithFiles {
    const app = this.get(oldSlug);
    if (app.stableStatus === 'running') {
      throw new BadRequestError(`App '${oldSlug}' must be stopped before renaming`);
    }

    if (oldSlug === newSlug) {
      return this.getAppWithFiles(oldSlug);
    }

    if (!APP_SLUG_PATTERN.test(newSlug)) {
      throw new InvalidNameError(`Invalid app slug '${newSlug}'. Must match ${APP_SLUG_PATTERN}`);
    }
    if (newSlug.startsWith('_')) {
      throw new InvalidNameError(`Invalid app slug '${newSlug}'. App slugs cannot start with '_'`);
    }

    const db = this.workspace.getPlatformDb();
    const existing = db.query('SELECT slug FROM apps WHERE slug = ?').get(newSlug);
    if (existing) {
      throw new AlreadyExistsError(`App with slug '${newSlug}' already exists`);
    }

    const oldContext = this.workspace.getOrCreateApp(oldSlug);
    oldContext?.close();

    const oldDraftWasRunning = this.registry?.get(oldSlug, 'draft')?.status === 'running';
    const oldStableWasRunning = this.registry?.get(oldSlug, 'stable')?.status === 'running';

    if (this.registry && oldDraftWasRunning) {
      this.registry.stop(oldSlug, 'draft');
    }
    if (this.registry && oldStableWasRunning) {
      this.registry.stop(oldSlug, 'stable');
    }

    const oldStableDir = join(this.workspace.stableDir, oldSlug);
    const newStableDir = join(this.workspace.stableDir, newSlug);
    const oldDraftDir = join(this.workspace.draftDir, oldSlug);
    const newDraftDir = join(this.workspace.draftDir, newSlug);

    if (existsSync(newStableDir) || existsSync(newDraftDir)) {
      throw new AlreadyExistsError(`Filesystem data for app '${newSlug}' already exists`);
    }

    let stableDirRenamed = false;
    let draftDirRenamed = false;

    db.exec('BEGIN');
    try {
      db.query(`
        INSERT INTO apps (
          slug,
          display_name,
          description,
          stable_status,
          current_version,
          published_version,
          created_at,
          updated_at
        )
        SELECT
          ?,
          display_name,
          description,
          stable_status,
          current_version,
          published_version,
          created_at,
          datetime('now')
        FROM apps
        WHERE slug = ?
      `).run(newSlug, oldSlug);

      db.query('UPDATE app_files SET app_slug = ? WHERE app_slug = ?').run(newSlug, oldSlug);
      db.query('UPDATE api_keys SET app_slug = ? WHERE app_slug = ?').run(newSlug, oldSlug);
      db.query('UPDATE agent_sessions SET app_slug = ? WHERE app_slug = ?').run(newSlug, oldSlug);
      db.query('UPDATE agent_messages SET app_slug = ? WHERE app_slug = ?').run(newSlug, oldSlug);
      db.query('DELETE FROM apps WHERE slug = ?').run(oldSlug);

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

    this.sessionCleanup?.remove(oldSlug);
    this.workspace.removeApp(oldSlug);
    this.workspace.refreshAppState(newSlug);
    this.ensureDraftRuntime(newSlug);

    return this.getAppWithFiles(newSlug);
  }

  private ensureDraftRuntime(slug: string): void {
    if (!this.registry) return;

    const state = this.workspace.getAppState(slug) ?? this.workspace.refreshAppState(slug);
    if (!state?.hasDraft) return;

    const existing = this.registry.get(slug, 'draft');
    if (existing?.status === 'running') return;

    if (existing) {
      this.registry.restart(slug, this.getRuntimeConfig(slug, 'draft'));
      return;
    }

    this.registry.start(slug, this.getRuntimeConfig(slug, 'draft'));
  }

  private getStateInfo(slug: string): AppStateInfo {
    const state = this.workspace.getAppState(slug) ?? this.workspace.refreshAppState(slug);
    if (!state) {
      throw new NotFoundError(`App '${slug}' not found`);
    }
    return state;
  }

  private getRuntimeConfig(slug: string, mode: AppMode) {
    const appContext = this.workspace.getOrCreateApp(slug);
    if (!appContext) {
      throw new NotFoundError(`App '${slug}' not found`);
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
    const state = this.getStateInfo(app.slug);
    return {
      slug: app.slug,
      displayName: app.display_name,
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
  slug: string;
  display_name: string;
  description: string;
  stable_status: StableStatus | null;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
}
