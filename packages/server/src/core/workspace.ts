import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { AppContext } from './app-context';

// --- YAML Schema Definitions ---

const ColumnSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['text', 'integer', 'real', 'blob', 'numeric']),
  primary_key: z.boolean().optional(),
  required: z.boolean().optional(),   // maps to NOT NULL
  unique: z.boolean().optional(),
  default: z.string().optional(),
  references: z.string().optional(),   // e.g. "users(id)"
});

const IndexSchema = z.object({
  columns: z.array(z.string()).min(1),
  unique: z.boolean().optional(),
  name: z.string().optional(),
});

const TableSpecSchema = z.object({
  columns: z.array(ColumnSchema).min(1),
  indexes: z.array(IndexSchema).optional(),
});

const AppSpecSchema = z.object({
  description: z.string().optional(),
}).passthrough();

const WorkspaceConfigSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
});

export type ColumnSpec = z.infer<typeof ColumnSchema>;
export type IndexSpec = z.infer<typeof IndexSchema>;
export type TableSpec = z.infer<typeof TableSpecSchema>;
export type AppSpec = z.infer<typeof AppSpecSchema>;
export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// --- App Discovery Result ---

export interface AppDefinition {
  name: string;
  dir: string;
  spec: AppSpec;
  tables: Map<string, { spec: TableSpec; content: string }>;
  functions: string[];    // function names (file stems)
}

// --- Constants ---

const SUPPORTED_VERSION = 1;
const APP_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

// --- Workspace ---

export class Workspace {
  readonly root: string;
  readonly appsDir: string;
  readonly dataDir: string;

  private _config: WorkspaceConfig | null = null;
  private _platformDb: Database | null = null;
  private _apps = new Map<string, AppContext>();

  constructor(root: string) {
    this.root = root;
    this.appsDir = join(root, 'apps');
    this.dataDir = join(root, 'data');
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
      ['data/', '*.sqlite', '*.sqlite-wal', '*.sqlite-shm', ''].join('\n'),
      'utf-8',
    );

    // Create example app
    const helloDir = join(this.appsDir, 'hello');
    mkdirSync(helloDir, { recursive: true });
    writeFileSync(
      join(helloDir, 'app.yaml'),
      stringifyYAML({ description: 'Hello World' }),
      'utf-8',
    );

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

      CREATE TABLE IF NOT EXISTS resource_state (
        app_name TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_name TEXT NOT NULL,
        spec_hash TEXT NOT NULL,
        applied_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (app_name, resource_type, resource_name)
      );
    `);
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

    const ctx = new AppContext(name, definition, this.appsDir, this.dataDir);
    this._apps.set(name, ctx);
    return ctx;
  }

  // --- Git ---

  /** Auto-commit apps/ directory changes */
  commit(message: string): void {
    // Check if there are changes to commit
    const status = this.gitExec(['status', '--porcelain', 'apps/']);
    if (!status || status.trim() === '') {
      return; // Nothing to commit
    }

    this.gitExec(['add', 'apps/']);
    this.gitExec(['commit', '-m', message]);
  }

  // --- Internal helpers ---

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

    // Load tables
    const tables = new Map<string, { spec: TableSpec; content: string }>();
    const tablesDir = join(dir, 'tables');
    if (existsSync(tablesDir)) {
      const files = readdirSync(tablesDir).filter((f) => f.endsWith('.yaml'));
      for (const file of files) {
        const tableName = basename(file, '.yaml');
        try {
          const content = readFileSync(join(tablesDir, file), 'utf-8');
          const parsed = parseYAML(content);
          const tableSpec = TableSpecSchema.parse(parsed);
          tables.set(tableName, { spec: tableSpec, content });
        } catch (err: any) {
          console.error(`[${name}] Failed to parse tables/${file}: ${err.message}`);
        }
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

    return { name, dir, spec, tables, functions };
  }

  /** Execute a git command in the workspace root (best effort, returns stdout or null) */
  private gitExec(args: string[]): string | null {
    try {
      const result = Bun.spawnSync(['git', ...args], {
        cwd: this.root,
        stdout: 'pipe',
        stderr: 'pipe',
      });

      if (result.exitCode !== 0) {
        const stderr = result.stderr.toString().trim();
        if (stderr) {
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
}

// --- Utility ---

/** Compute SHA256 hash of a string */
export function hashContent(content: string): string {
  const hasher = new Bun.CryptoHasher('sha256');
  hasher.update(content);
  return hasher.digest('hex');
}
