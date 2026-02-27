import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse as parseYAML, stringify as stringifyYAML } from 'yaml';
import { z } from 'zod';
import { AppContext } from './app-context';

// --- YAML Schema Definitions ---

// Strict CSS value pattern: disallow characters that could break out of CSS/HTML context
const safeCSSValue = z.string().regex(/^[^{}<>]*$/);
const safeCSSKey = z.string().regex(/^[a-zA-Z0-9-]+$/);

const ThemeConfigSchema = z.object({
  mode: z.enum(['light', 'dark', 'system']).default('light'),
  primaryColor: safeCSSValue.optional(),
  fontFamily: safeCSSValue.optional(),
  tokens: z.record(safeCSSKey, safeCSSValue).optional(),
}).default({});

const WorkspaceConfigSchema = z.object({
  name: z.string(),
  version: z.number().int().positive(),
  theme: ThemeConfigSchema.optional(),
});

export type WorkspaceConfig = z.infer<typeof WorkspaceConfigSchema>;

// --- App State ---

export type AppState = 'draft_only' | 'stable' | 'stable_draft' | 'deleted';

// --- App Definition (DB-backed) ---

export interface AppDefinition {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
}

// --- Constants ---

const SUPPORTED_VERSION = 1;
const TEMPLATES_DIR = join(import.meta.dir, '..', '..', 'templates');

// --- Workspace ---

export class Workspace {
  readonly root: string;
  readonly stableDir: string;
  readonly draftDir: string;

  private _config: WorkspaceConfig | null = null;
  private _platformDb: Database | null = null;
  private _apps = new Map<string, AppContext>();
  private _appStates = new Map<string, AppState>();

  constructor(root: string) {
    this.root = root;
    this.stableDir = join(root, 'stable');
    this.draftDir = join(root, 'draft');
  }

  // --- Lifecycle ---

  /** Check if the workspace has been initialized */
  isInitialized(): boolean {
    return existsSync(join(this.root, 'workspace.yaml'));
  }

  /** Initialize a new workspace: directories, config, template apps to DB */
  init(): void {
    mkdirSync(this.stableDir, { recursive: true });
    mkdirSync(this.draftDir, { recursive: true });

    // Write workspace.yaml
    const config: WorkspaceConfig = { name: 'cozybase', version: SUPPORTED_VERSION };
    writeFileSync(
      join(this.root, 'workspace.yaml'),
      stringifyYAML(config),
      'utf-8',
    );

    // Initialize platform DB and load template apps
    this.getPlatformDb();
    this.loadTemplateApps();
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

  /** Get the theme configuration (safe for passing to generateThemeCSS) */
  getThemeConfig(): { mode?: 'light' | 'dark' | 'system'; primaryColor?: string; fontFamily?: string; tokens?: Record<string, string> } {
    return this._config?.theme ?? {};
  }

  /** Update theme configuration in workspace.yaml (merge semantics) */
  updateThemeConfig(partial: z.input<typeof ThemeConfigSchema> = {}): void {
    const configPath = join(this.root, 'workspace.yaml');
    const content = readFileSync(configPath, 'utf-8');
    const raw = parseYAML(content) ?? {};
    const existing = raw.theme ?? {};
    // Shallow merge top-level fields; deep merge tokens
    raw.theme = {
      ...existing,
      ...partial,
      tokens: partial.tokens !== undefined
        ? { ...existing.tokens, ...partial.tokens }
        : existing.tokens,
    };
    writeFileSync(configPath, stringifyYAML(raw), 'utf-8');

    // Reload config
    this._config = WorkspaceConfigSchema.parse(raw);
  }

  // --- Platform DB ---

  /** Get or initialize the platform-level database */
  getPlatformDb(): Database {
    if (!this._platformDb) {
      const dbPath = join(this.root, 'platform.sqlite');
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

      CREATE TABLE IF NOT EXISTS app_files (
        app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        immutable INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (app_name, path)
      );
    `);

    // Extend apps table with version fields (conditional ALTER)
    const columns = db.query("PRAGMA table_info(apps)").all() as { name: string }[];
    const columnNames = new Set(columns.map(c => c.name));

    if (!columnNames.has('current_version')) {
      db.exec("ALTER TABLE apps ADD COLUMN current_version INTEGER DEFAULT 0");
    }
    if (!columnNames.has('published_version')) {
      db.exec("ALTER TABLE apps ADD COLUMN published_version INTEGER DEFAULT 0");
    }
  }

  // --- App State ---

  /** Get the current state of an app (uses cache) */
  getAppState(name: string): AppState | undefined {
    return this._appStates.get(name);
  }

  /** Refresh the state cache for a specific app (DB-based) */
  refreshAppState(name: string): AppState | undefined {
    const db = this.getPlatformDb();
    const row = db.query(
      'SELECT status, current_version, published_version FROM apps WHERE name = ?',
    ).get(name) as { status: string; current_version: number; published_version: number } | null;

    if (!row) {
      this._appStates.delete(name);
      return undefined;
    }

    if (row.status === 'deleted') {
      this._appStates.set(name, 'deleted');
      return 'deleted';
    }

    let state: AppState;
    if (row.published_version === 0) {
      state = 'draft_only';
    } else if (row.current_version === row.published_version) {
      state = 'stable';
    } else {
      state = 'stable_draft';
    }

    this._appStates.set(name, state);
    return state;
  }

  /** Refresh state cache for all apps (DB-based) */
  refreshAllAppStates(): void {
    this._appStates.clear();

    const db = this.getPlatformDb();
    const rows = db.query('SELECT name FROM apps WHERE status != ?').all('deleted') as { name: string }[];
    for (const row of rows) {
      this.refreshAppState(row.name);
    }
  }

  // --- App Management ---

  /** Query all apps from the platform DB */
  scanApps(): AppDefinition[] {
    const db = this.getPlatformDb();
    return db.query(
      'SELECT name, description, status, current_version, published_version FROM apps ORDER BY name',
    ).all() as AppDefinition[];
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

  /** Get or create an AppContext (DB-backed check) */
  getOrCreateApp(name: string): AppContext | null {
    const cached = this._apps.get(name);
    if (cached) return cached;

    // Check if app exists in DB
    const db = this.getPlatformDb();
    const row = db.query('SELECT name FROM apps WHERE name = ?').get(name);
    if (!row) return null;

    const ctx = new AppContext(name, this.stableDir, this.draftDir);
    this._apps.set(name, ctx);
    return ctx;
  }

  // --- Template Loading ---

  /** Load template apps from templates/ directory into the platform DB */
  loadTemplateApps(): void {
    if (!existsSync(TEMPLATES_DIR)) {
      console.warn('[workspace] Templates directory not found, skipping template app creation');
      return;
    }

    const entries = readdirSync(TEMPLATES_DIR, { withFileTypes: true });
    const templates = entries.filter((e) => e.isDirectory());
    if (templates.length === 0) {
      console.warn('[workspace] No template apps found in templates directory');
      return;
    }

    for (const entry of templates) {
      const src = join(TEMPLATES_DIR, entry.name);
      this.importAppFromDir(entry.name, src);
    }
  }

  /** Import an app from a filesystem directory into the platform DB */
  importAppFromDir(appName: string, dir: string): void {
    const db = this.getPlatformDb();

    // Parse description from app.yaml if it exists
    let description = '';
    const appYamlPath = join(dir, 'app.yaml');
    if (existsSync(appYamlPath)) {
      try {
        const content = readFileSync(appYamlPath, 'utf-8').trim();
        if (content) {
          const parsed = parseYAML(content);
          description = parsed?.description ?? '';
        }
      } catch {
        // Ignore parse errors
      }
    }

    // Check if app already exists
    const existing = db.query('SELECT name FROM apps WHERE name = ?').get(appName);
    if (existing) return;

    // Create app record
    db.query(
      'INSERT INTO apps (name, description, current_version, published_version) VALUES (?, ?, 1, 0)',
    ).run(appName, description);

    // Recursively collect files and write to app_files
    const files = this.collectFiles(dir, '');
    for (const file of files) {
      db.query(
        'INSERT INTO app_files (app_name, path, content) VALUES (?, ?, ?)',
      ).run(appName, file.path, file.content);
    }
  }

  /** Recursively collect all files from a directory */
  private collectFiles(baseDir: string, prefix: string): { path: string; content: string }[] {
    const result: { path: string; content: string }[] = [];
    const entries = readdirSync(baseDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // Skip hidden files
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = join(baseDir, entry.name);

      if (entry.isDirectory()) {
        result.push(...this.collectFiles(fullPath, relativePath));
      } else if (entry.isFile()) {
        const content = readFileSync(fullPath, 'utf-8');
        result.push({ path: relativePath, content });
      }
    }

    return result;
  }
}
