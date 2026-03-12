import { nanoid } from 'nanoid';
import { rmSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import type { Workspace, AppStateInfo, StableStatus } from '../../core/workspace';
import { hashApiKey } from '../../core/auth';
import type { EventBus } from '../../core/event-bus';
import {
  AppError,
  NotFoundError,
  AlreadyExistsError,
  InvalidNameError,
  VersionConflictError,
  ImmutableFileError,
  BadRequestError,
} from '../../core/errors';
import type { AppRegistry, AppMode } from '@cozybase/runtime';
import type { DraftRebuilder } from '../../core/draft-rebuilder';
import {
  classifyAppFileUpdate,
  exportFunctionsFromDb,
  exportSingleFunction,
  exportUiFile,
  exportUiFromDb,
} from '../../core/file-export';

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
  rebuildError?: string; // non-fatal: app created but draft env failed
  reconcileError?: string; // legacy alias
}

export interface AppUpdateResult {
  app: AppWithFiles;
  needsRebuild: boolean;
}

export interface AppFileUpdateResult extends AppFile {
  needsRebuild: boolean;
}

// Template function file content
const TEMPLATE_FUNCTION = `import type { FunctionContext } from 'cozybase';

export async function GET(ctx: FunctionContext) {
  return {
    message: 'Hello from CozyBase!',
    trigger: ctx.trigger,
    hasRequest: ctx.req !== undefined,
  };
}
`;

/** Callback to clean up agent sessions when apps are deleted/renamed */
export interface SessionCleanup {
  remove(appSlug: string): void;
}

export interface StableLifecycleHooks {
  onStableStarted?: (appSlug: string) => void;
  onStableStopped?: (appSlug: string) => void;
  onAppDeleted?: (appSlug: string) => void;
}

export interface PrepareDraftRuntimeResult {
  status: 'ready' | 'skipped' | 'error';
  error?: {
    statusCode: number;
    code: string;
    message: string;
  };
}

// --- AppManager ---

export class AppManager {
  private sessionCleanup: SessionCleanup | null = null;
  private prepareLocks = new Map<string, Promise<PrepareDraftRuntimeResult>>();

  constructor(
    private workspace: Workspace,
    private registry?: AppRegistry,
    private draftRebuilder?: DraftRebuilder,
    private lifecycleHooks?: StableLifecycleHooks,
    private eventBus?: EventBus,
  ) {}

  /** Set the session cleanup handler (called by server.ts after ChatSessionManager is created) */
  setSessionCleanup(cleanup: SessionCleanup): void {
    this.sessionCleanup = cleanup;
  }

  /** Check if a slug exists */
  exists(slug: string): boolean {
    const repo = this.workspace.getPlatformRepo();
    return repo.apps.exists(slug);
  }

  /** List apps (basic info, no files), optionally filtered by mode */
  list(mode?: AppMode): (App & { has_ui: boolean })[] {
    const repo = this.workspace.getPlatformRepo();
    const apps = repo.apps.findAll();

    // Batch-check which apps have ui/pages.json
    const db = this.workspace.getPlatformDb();
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
    const repo = this.workspace.getPlatformRepo();
    const app = repo.apps.findBySlug(slug);
    if (!app) throw new NotFoundError(`App '${slug}' not found`);
    return this.toApp(app);
  }

  /** Get a single app with all its files */
  getAppWithFiles(slug: string): AppWithFiles {
    const app = this.get(slug);
    const repo = this.workspace.getPlatformRepo();

    const files = repo.appFiles.findByApp(slug);

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

    const repo = this.workspace.getPlatformRepo();

    // Check slug uniqueness
    if (repo.apps.exists(slug)) {
      throw new AlreadyExistsError(`App with slug '${slug}' already exists`);
    }

    // Wrap all writes in a transaction
    let rawKey = '';
    try {
      repo.transaction(() => {
        // Create app record with version = 1
        repo.apps.create({
          slug,
          displayName,
          description,
          currentVersion: 1,
          publishedVersion: 0,
        });

        // Create template files in app_files
        const templateFiles = [
          { path: 'app.yaml', content: `description: ${description}\n` },
          { path: 'functions/hello.ts', content: TEMPLATE_FUNCTION },
          { path: 'ui/pages.json', content: '{"pages": []}' },
        ];

        for (const file of templateFiles) {
          repo.appFiles.create(slug, file.path, file.content);
        }

        // Generate a default service API key
        rawKey = `cb_${nanoid(32)}`;
        const keyId = nanoid(12);
        repo.apiKeys.create({
          id: keyId,
          appSlug: slug,
          keyHash: hashApiKey(rawKey),
          name: 'Default Service Key',
          role: 'service',
        });
      });

      // Refresh app state cache
      this.workspace.refreshAppState(slug);

      // Auto-reconcile to initialize Draft environment (creates draft DB, functions, UI)
      let rebuildError: string | undefined;
      if (this.draftRebuilder) {
        try {
          const rebuildResult = await this.draftRebuilder.rebuild(slug);
          if (!rebuildResult.success) {
            rebuildError = rebuildResult.error ?? 'Draft rebuild failed';
            console.error(`Auto-rebuild failed for '${slug}': ${rebuildError}`);
          }
        } catch (err) {
          rebuildError = err instanceof Error ? err.message : String(err);
          console.error(`Auto-rebuild failed for '${slug}':`, err);
        }
      }

      // Start draft runtime (now with rebuilt state)
      this.ensureDraftRuntime(slug);

      const appWithFiles = this.getAppWithFiles(slug);
      return { app: appWithFiles, apiKey: rawKey, rebuildError, reconcileError: rebuildError };
    } catch (err) {
      throw err;
    }
  }

  /** Whole-app update with optimistic locking */
  updateApp(
    slug: string,
    files: { path: string; content: string }[],
    baseVersion: number,
  ): AppUpdateResult {
    const repo = this.workspace.getPlatformRepo();

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
    const versionInfo = repo.apps.getVersionInfo(slug);
    if (!versionInfo) throw new NotFoundError(`App '${slug}' not found`);

    if (versionInfo.current_version !== baseVersion) {
      throw new VersionConflictError(
        `Version conflict: expected ${baseVersion}, current is ${versionInfo.current_version}. Please fetch and retry.`,
      );
    }

    // Get current files from DB
    const currentFiles = repo.appFiles.findByApp(slug);
    const currentFileMap = new Map(currentFiles.map((f) => [f.path, f]));
    const requestedPaths = new Set(files.map((f) => f.path));
    const changedPaths: string[] = [];

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
    repo.transaction(() => {
      // Delete non-immutable files that are not in the request
      for (const current of currentFiles) {
        if (!requestedPaths.has(current.path) && current.immutable !== 1) {
          repo.appFiles.delete(slug, current.path);
          changedPaths.push(current.path);
        }
      }

      // Upsert requested files
      for (const file of files) {
        const current = currentFileMap.get(file.path);
        if (!current) {
          // New file
          repo.appFiles.create(slug, file.path, file.content);
          changedPaths.push(file.path);
        } else if (current.content !== file.content && current.immutable !== 1) {
          // Modified non-immutable file
          repo.appFiles.update(slug, file.path, file.content);
          changedPaths.push(file.path);
        }
        // Immutable files with same content: skip
      }

      // Increment version
      repo.apps.incrementVersion(slug);
    });

    this.workspace.refreshAppState(slug);
    const hotExported = this.hotExportBatchUpdate(slug, changedPaths);
    const runtimeReady = this.ensureDraftRuntime(slug);
    if (hotExported && this.shouldEmitReconciled(runtimeReady)) {
      this.emitReconciled(slug);
    }

    return {
      app: this.getAppWithFiles(slug),
      needsRebuild: changedPaths.some((path) => classifyAppFileUpdate(path).needsRebuild),
    };
  }

  /** Single file update (no version lock needed) */
  updateFile(slug: string, path: string, content: string): AppFileUpdateResult {
    assertSafeFilePath(path);
    const repo = this.workspace.getPlatformRepo();

    // Check app exists
    if (!repo.apps.exists(slug)) {
      throw new NotFoundError(`App '${slug}' not found`);
    }

    // Check immutability
    const existing = repo.appFiles.findByAppAndPath(slug, path);
    if (existing && existing.immutable === 1 && existing.content !== content) {
      throw new ImmutableFileError(
        `Cannot modify immutable file '${path}'. Already-published migrations are immutable.`,
      );
    }

    // UPSERT
    repo.appFiles.upsert(slug, path, content);

    // Increment version
    repo.apps.incrementVersion(slug);

    this.workspace.refreshAppState(slug);
    const updatePlan = classifyAppFileUpdate(path);
    const hotExported = this.hotExportSingleFile(slug, path, content);
    const runtimeReady = this.ensureDraftRuntime(slug);
    if (hotExported && this.shouldEmitReconciled(runtimeReady)) {
      this.emitReconciled(slug);
    }

    const immutable = existing?.immutable === 1;
    return { path, content, immutable, needsRebuild: updatePlan.needsRebuild };
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

    this.invokeLifecycleHook(this.lifecycleHooks?.onAppDeleted, slug);

    // Remove from workspace caches (also closes DB connections)
    this.workspace.removeApp(slug);

    // Remove platform records (CASCADE handles dependent app_files and api_keys rows)
    const repo = this.workspace.getPlatformRepo();
    repo.apps.delete(slug);

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
    const repo = this.workspace.getPlatformRepo();

    if (data.description !== undefined) {
      repo.apps.update(slug, { description: data.description });
    }

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

    const repo = this.workspace.getPlatformRepo();
    repo.apps.update(slug, { stable_status: 'running' });
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

    this.invokeLifecycleHook(this.lifecycleHooks?.onStableStarted, slug);

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

    const repo = this.workspace.getPlatformRepo();
    repo.apps.update(slug, { stable_status: 'stopped' });
    this.workspace.refreshAppState(slug);

    if (this.registry) {
      try {
        this.registry.stop(slug, 'stable');
      } catch {
        // Ignore if the runtime was not running.
      }
    }

    this.invokeLifecycleHook(this.lifecycleHooks?.onStableStopped, slug);

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

    db.run('BEGIN');
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

      db.run('COMMIT');
    } catch (err) {
      if (draftDirRenamed && existsSync(newDraftDir)) {
        renameSync(newDraftDir, oldDraftDir);
      }
      if (stableDirRenamed && existsSync(newStableDir)) {
        renameSync(newStableDir, oldStableDir);
      }
      db.run('ROLLBACK');
      throw err;
    }

    this.sessionCleanup?.remove(oldSlug);
    this.workspace.removeApp(oldSlug);
    this.workspace.refreshAppState(newSlug);
    this.ensureDraftRuntime(newSlug);

    return this.getAppWithFiles(newSlug);
  }

  /** Prepare draft runtime for a stable-only app, coalescing concurrent requests */
  async prepareDraftRuntime(slug: string): Promise<PrepareDraftRuntimeResult> {
    // Fast path: already running
    if (this.registry?.get(slug, 'draft')?.status === 'running') {
      return { status: 'ready' };
    }

    // Coalesce concurrent requests
    const existing = this.prepareLocks.get(slug);
    if (existing) return existing;

    const promise = this._doPrepareDraftRuntime(slug).finally(() => {
      this.prepareLocks.delete(slug);
    });
    this.prepareLocks.set(slug, promise);
    return promise;
  }

  private async _doPrepareDraftRuntime(slug: string): Promise<PrepareDraftRuntimeResult> {
    const state = this.workspace.getAppState(slug) ?? this.workspace.refreshAppState(slug);
    if (!state) {
      return { status: 'skipped' };
    }

    if (state.hasDraft) {
      if (this.ensureDraftRuntime(slug)) {
        return { status: 'ready' };
      }
      return this.materializeDraftRuntime(slug);
    }

    if (state.stableStatus === null) {
      return { status: 'skipped' };
    }

    return this.materializeDraftRuntime(slug, { force: true });
  }

  private async materializeDraftRuntime(
    slug: string,
    options?: { force?: boolean },
  ): Promise<PrepareDraftRuntimeResult> {
    if (!this.draftRebuilder || !this.registry) {
      return {
        status: 'error',
        error: {
          statusCode: 503,
          code: 'DRAFT_PREPARE_UNAVAILABLE',
          message: `Draft preparation is unavailable for '${slug}'`,
        },
      };
    }

    try {
      const result = await this.draftRebuilder.rebuild(slug, options);
      if (!result.success) {
        return {
          status: 'error',
          error: {
            statusCode: 500,
            code: 'DRAFT_PREPARE_FAILED',
            message: result.error ?? `Failed to prepare draft runtime for '${slug}'`,
          },
        };
      }

      const appContext = this.workspace.getOrCreateApp(slug);
      if (!appContext?.hasDraftRebuildState()) {
        return {
          status: 'error',
          error: {
            statusCode: 500,
            code: 'DRAFT_PREPARE_FAILED',
            message: `Failed to materialize draft runtime for '${slug}'`,
          },
        };
      }

      this.registry.restart(slug, this.getRuntimeConfig(slug, 'draft'));
      return this.registry.get(slug, 'draft')?.status === 'running'
        ? { status: 'ready' }
        : {
            status: 'error',
            error: {
              statusCode: 500,
              code: 'DRAFT_PREPARE_FAILED',
              message: `Draft runtime failed to start for '${slug}'`,
            },
          };
    } catch (err) {
      if (err instanceof AppError) {
        return {
          status: 'error',
          error: {
            statusCode: err.statusCode,
            code: err.code ?? 'DRAFT_PREPARE_FAILED',
            message: err.message,
          },
        };
      }

      return {
        status: 'error',
        error: {
          statusCode: 500,
          code: 'DRAFT_PREPARE_FAILED',
          message: err instanceof Error ? err.message : `Failed to prepare draft runtime for '${slug}'`,
        },
      };
    }
  }

  private ensureDraftRuntime(slug: string): boolean {
    if (!this.registry) return false;

    const state = this.workspace.getAppState(slug) ?? this.workspace.refreshAppState(slug);
    if (!state?.hasDraft) return false;

    const appContext = this.workspace.getOrCreateApp(slug);
    if (!appContext?.hasDraftRebuildState()) return false;

    const existing = this.registry.get(slug, 'draft');
    if (existing?.status === 'running') return true;

    if (existing) {
      this.registry.restart(slug, this.getRuntimeConfig(slug, 'draft'));
      return this.registry.get(slug, 'draft')?.status === 'running';
    }

    this.registry.start(slug, this.getRuntimeConfig(slug, 'draft'));
    return this.registry.get(slug, 'draft')?.status === 'running';
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

  private invokeLifecycleHook(
    hook: ((appSlug: string) => void) | undefined,
    appSlug: string,
  ): void {
    if (!hook) return;
    try {
      hook(appSlug);
    } catch (err) {
      console.error(`[app-manager] lifecycle hook failed for '${appSlug}'`, err);
    }
  }

  private hotExportSingleFile(slug: string, path: string, content: string): boolean {
    const appContext = this.workspace.getOrCreateApp(slug);
    if (!appContext) {
      return false;
    }

    const updatePlan = classifyAppFileUpdate(path);
    if (updatePlan.kind === 'ui') {
      exportUiFile(appContext.draftDataDir, content);
      return true;
    }
    if (updatePlan.kind === 'function') {
      exportSingleFunction(appContext.draftDataDir, path, content);
      return true;
    }
    return false;
  }

  private hotExportBatchUpdate(
    slug: string,
    changedPaths: string[],
  ): boolean {
    const appContext = this.workspace.getOrCreateApp(slug);
    if (!appContext) {
      return false;
    }

    const repo = this.workspace.getPlatformRepo();
    let exported = false;
    const touchedUiFile = changedPaths.includes('ui/pages.json');
    const touchedFunctionFiles = changedPaths.some((path) => path.startsWith('functions/'));

    if (touchedUiFile) {
      exportUiFromDb(repo, slug, appContext.draftDataDir);
      exported = true;
    }

    if (touchedFunctionFiles) {
      exportFunctionsFromDb(repo, slug, join(appContext.draftDataDir, 'functions'));
      exported = true;
    }

    return exported;
  }

  private emitReconciled(slug: string): void {
    this.eventBus?.emit('app:reconciled', { appSlug: slug });
  }

  private shouldEmitReconciled(runtimeReady: boolean): boolean {
    return this.registry === undefined || runtimeReady;
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
