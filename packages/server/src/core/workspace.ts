import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync } from 'fs';
import { join, basename, dirname } from 'path';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { AppContext } from './app-context';

// --- YAML Schema Definitions ---

const AppSpecSchema = z.object({
  description: z.string().optional(),
  status: z.enum(['deleted']).optional(),
}).passthrough();

const WorkspaceConfigSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
});

export type AppSpec = z.infer<typeof AppSpecSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// --- App State ---

export type AppState = 'draft_only' | 'stable' | 'stable_draft' | 'deleted';

// --- App Discovery Result ---

export interface AppDefinition {
  name: string;
  dir: string;
  spec: AppSpec;
  migrations: string[];   // migration file paths (sorted)
  seeds: string[];         // seed file paths (sorted)
  functions: string[];     // function names (file stems)
}

// --- Constants ---

const SUPPORTED_VERSION = 1;
const APP_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TEMPLATES_DIR = join(import.meta.dir, '..', '..', 'templates');

// --- Workspace ---

export class Workspace {
  readonly root: string;
  readonly appsDir: string;
  readonly dataDir: string;
  readonly draftDir: string;

  private _config: WorkspaceConfig | null = null;
  private _platformDb: Database | null = null;
  private _apps = new Map<string, AppContext>();
  private _appStates = new Map<string, AppState>();

  constructor(root: string) {
    this.root = root;
    this.appsDir = join(root, 'apps');
    this.dataDir = join(root, 'data');
    this.draftDir = join(root, 'draft');
  }

  // --- Lifecycle ---

  /** Check if the workspace has been initialized */
  isInitialized(): boolean {
    return existsSync(join(this.root, 'workspace.yaml'));
  }

  /** Initialize a new workspace: directories, config, git, example app */
  init(): void {
    mkdirSync(this.appsDir, { recursive: true });
    mkdirSync(this.dataDir, { recursive: true });
    mkdirSync(this.draftDir, { recursive: true });

    // Write workspace.yaml
    const config: WorkspaceConfig = { name: 'cozybase', version: SUPPORTED_VERSION };
    writeFileSync(
      join(this.root, 'workspace.yaml'),
      stringifyYAML(config),
      'utf-8',
    );

    // Write .gitignore
    writeFileSync(
      join(this.root, '.gitignore'),
      ['data/', 'draft/', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', ''].join('\n'),
      'utf-8',
    );

    // Copy template apps to workspace
    if (existsSync(TEMPLATES_DIR)) {
      const entries = readdirSync(TEMPLATES_DIR, { withFileTypes: true });
      const templates = entries.filter((e) => e.isDirectory());
      if (templates.length === 0) {
        console.warn('[workspace] No template apps found in templates directory');
      }
      for (const entry of templates) {
        const src = join(TEMPLATES_DIR, entry.name);
        const dest = join(this.appsDir, entry.name);
        cpSync(src, dest, { recursive: true });
      }
    } else {
      console.warn('[workspace] Templates directory not found, skipping template app creation');
    }

    // Git init + initial commit (best effort)
    this.gitExec(['init']);
    this.gitExec(['add', '.']);
    this.gitExec(['commit', '-m', 'init workspace']);
  }

  /** Load workspace configuration and initialize platform DB */
  load(): void {
    const configPath = join(this.root, 'workspace.yaml');
    const content = readFileSync(configPath, 'utf-8');
    const parsed = parseYAML(content);
    this._config = WorkspaceConfigSchema.parse(parsed);

    if (this._config.version !== SUPPORTED_VERSION) {
      throw new Error(
        `Unsupported workspace version: ${this._config.version} (supported: ${SUPPORTED_VERSION})`,
      );
    }

    // Eagerly initialize platform DB
    this.getPlatformDb();

    // Initialize app state cache
    this.refreshAllAppStates();
  }

  /** Close all resources */
  close(): void {
    for (const app of this._apps.values()) {
      app.close();
    }
    this._apps.clear();

    if (this._platformDb) {
      this._platformDb.close();
      this._platformDb = null;
    }
  }

  get config(): WorkspaceConfig {
    if (!this._config) {
      throw new Error('Workspace not loaded. Call load() first.');
    }
    return this._config;
  }

  // --- Platform DB ---

  /** Get or initialize the platform-level database */
  getPlatformDb(): Database {
    if (!this._platformDb) {
      const dbPath = join(this.dataDir, 'platform.sqlite');
      mkdirSync(dirname(dbPath), { recursive: true });
      this._platformDb = new Database(dbPath);
      this._platformDb.exec('PRAGMA journal_mode = WAL');
      this._platformDb.exec('PRAGMA foreign_keys = ON');
      this.initPlatformSchema();
    }
    return this._platformDb;
  }

  private initPlatformSchema(): void {
    const db = this._platformDb!;

    db.exec(`
      CREATE TABLE IF NOT EXISTS apps (
        name TEXT PRIMARY KEY,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS platform_users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'admin',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
        key_hash TEXT NOT NULL,
        name TEXT DEFAULT '',
        role TEXT DEFAULT 'service',
        expires_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
    `);
  }

  // --- App State ---

  /** Get the current state of an app (uses cache) */
  getAppState(name: string): AppState | undefined {
    return this._appStates.get(name);
  }

  /** Refresh the state cache for a specific app */
  refreshAppState(name: string): AppState | undefined {
    const appDir = join(this.appsDir, name);
    const appYamlPath = join(appDir, 'app.yaml');

    if (!existsSync(appYamlPath)) {
      this._appStates.delete(name);
      return undefined;
    }

    // Check for deleted status
    try {
      const content = readFileSync(appYamlPath, 'utf-8').trim();
      if (content) {
        const parsed = parseYAML(content);
        if (parsed?.status === 'deleted') {
          this._appStates.set(name, 'deleted');
          return 'deleted';
        }
      }
    } catch {
      // Ignore parse errors for state detection
    }

    const stableDbPath = join(this.dataDir, 'apps', name, 'db.sqlite');
    const stableExists = existsSync(stableDbPath);
    const hasUnstaged = this.hasUnstagedChanges(name);

    let state: AppState;
    if (stableExists && hasUnstaged) {
      state = 'stable_draft';
    } else if (stableExists && !hasUnstaged) {
      state = 'stable';
    } else if (!stableExists && hasUnstaged) {
      state = 'draft_only';
    } else {
      // No stable DB and no unstaged changes — treat as stable (committed but not yet reconciled)
      state = 'stable';
    }

    this._appStates.set(name, state);
    return state;
  }

  /** Refresh state cache for all apps */
  refreshAllAppStates(): void {
    this._appStates.clear();

    if (!existsSync(this.appsDir)) return;

    const entries = readdirSync(this.appsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!APP_NAME_PATTERN.test(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const appYamlPath = join(this.appsDir, entry.name, 'app.yaml');
      if (!existsSync(appYamlPath)) continue;

      this.refreshAppState(entry.name);
    }
  }

  /** Check if an app has unstaged changes via git status */
  private hasUnstagedChanges(name: string): boolean {
    const status = this.gitExec(['status', '--porcelain', `apps/${name}/`]);
    return !!status && status.trim() !== '';
  }

  // --- App Management ---

  /** Scan apps/ directory and return all app definitions */
  scanApps(): AppDefinition[] {
    if (!existsSync(this.appsDir)) {
      return [];
    }

    const entries = readdirSync(this.appsDir, { withFileTypes: true });
    const apps: AppDefinition[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!APP_NAME_PATTERN.test(entry.name)) continue;
      if (entry.name.startsWith('.')) continue;

      const appDir = join(this.appsDir, entry.name);
      const appYamlPath = join(appDir, 'app.yaml');

      if (!existsSync(appYamlPath)) continue;

      const app = this.loadAppDefinition(entry.name, appDir);
      if (app) apps.push(app);
    }

    return apps;
  }

  /** Get a cached AppContext by name (returns undefined if not cached) */
  getApp(name: string): AppContext | undefined {
    return this._apps.get(name);
  }

  /** Remove an app from all caches (also closes DB connections) */
  removeApp(name: string): void {
    const cached = this._apps.get(name);
    if (cached) {
      cached.close();
      this._apps.delete(name);
    }
    this._appStates.delete(name);
  }

  /** Get or create an AppContext (Hybrid: cached or lazy-loaded) */
  getOrCreateApp(name: string): AppContext | null {
    const cached = this._apps.get(name);
    if (cached) return cached;

    // Check if app.yaml exists
    const appDir = join(this.appsDir, name);
    const appYamlPath = join(appDir, 'app.yaml');
    if (!existsSync(appYamlPath)) {
      return null;
    }

    // Load definition and create AppContext
    const definition = this.loadAppDefinition(name, appDir);
    if (!definition) return null;

    const ctx = new AppContext(name, definition, this.appsDir, this.dataDir, this.draftDir);
    this._apps.set(name, ctx);
    return ctx;
  }

  // --- Git ---

  /** Commit changes for a specific app */
  commitApp(appName: string, message: string): void {
    const status = this.gitExec(['status', '--porcelain', `apps/${appName}/`]);
    if (!status || status.trim() === '') {
      return; // Nothing to commit
    }

    this.gitExec(['add', `apps/${appName}/`]);
    this.gitExec(['commit', '-m', message]);
  }

  /** Get the committed version of a file (for immutability checks) */
  getCommittedFileContent(relativePath: string): string | null {
    return this.gitExec(['show', `HEAD:${relativePath}`]);
  }

  /** Check if a file is tracked by git (committed) */
  isFileCommitted(relativePath: string): boolean {
    const result = this.gitExec(['ls-files', relativePath]);
    return !!result && result.trim() !== '';
  }

  // --- Internal helpers ---

  /** Execute a git command in the workspace root (best effort, returns stdout or null) */
  gitExec(args: string[]): string | null {
    try {
      const result = Bun.spawnSync(['git', ...args], {
        cwd: this.root,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString().trim();
        if (stderr && !stderr.includes('does not exist in')) {
          console.warn(`[git] ${args.join(' ')}: ${stderr}`);
        }
        return null;
      }

      return result.stdout.toString();
    } catch {
      console.warn(`[git] Command failed: git ${args.join(' ')} (git may not be installed)`);
      return null;
    }
  }

  /** Load a single app's full definition from its directory */
  loadAppDefinition(name: string, dir: string): AppDefinition | null {
    const appYamlPath = join(dir, 'app.yaml');

    // Parse app.yaml (can be empty)
    let spec: AppSpec = {};
    try {
      const content = readFileSync(appYamlPath, 'utf-8').trim();
      if (content) {
        const parsed = parseYAML(content);
        spec = AppSpecSchema.parse(parsed ?? {});
      }
    } catch (err: any) {
      console.error(`[${name}] Failed to parse app.yaml: ${err.message}`);
      return null;
    }

    // Discover migrations
    const migrations: string[] = [];
    const migrationsDir = join(dir, 'migrations');
    if (existsSync(migrationsDir)) {
      const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        migrations.push(join(migrationsDir, file));
      }
    }

    // Discover seeds
    const seeds: string[] = [];
    const seedsDir = join(dir, 'seeds');
    if (existsSync(seedsDir)) {
      const files = readdirSync(seedsDir).filter((f) => f.endsWith('.sql') || f.endsWith('.json')).sort();
      for (const file of files) {
        seeds.push(join(seedsDir, file));
      }
    }

    // Discover functions
    const functions: string[] = [];
    const functionsDir = join(dir, 'functions');
    if (existsSync(functionsDir)) {
      const files = readdirSync(functionsDir).filter((f) => f.endsWith('.ts'));
      for (const file of files) {
        functions.push(basename(file, '.ts'));
      }
    }

    return { name, dir, spec, migrations, seeds, functions };
  }
}
