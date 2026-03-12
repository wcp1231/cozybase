import type { Database } from 'bun:sqlite';

export interface PlatformMigration {
  version: number;
  name: string;
  run: (db: Database) => void;
}

const PLATFORM_BASELINE_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS apps (
    slug TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    description TEXT DEFAULT '',
    stable_status TEXT DEFAULT NULL,
    current_version INTEGER DEFAULT 0,
    published_version INTEGER DEFAULT 0,
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
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    key_hash TEXT NOT NULL,
    name TEXT DEFAULT '',
    role TEXT DEFAULT 'service',
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_files (
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    immutable INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (app_slug, path)
  );

  CREATE TABLE IF NOT EXISTS agent_sessions (
    app_slug TEXT PRIMARY KEY REFERENCES apps(slug) ON DELETE CASCADE,
    sdk_session_id TEXT,
    provider_kind TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_name TEXT,
    tool_status TEXT,
    tool_summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_agent_messages_app
    ON agent_messages(app_slug, id);

  CREATE TABLE IF NOT EXISTS schedule_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    schedule_name TEXT NOT NULL,
    runtime_mode TEXT NOT NULL,
    trigger_mode TEXT NOT NULL,
    status TEXT NOT NULL,
    function_ref TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    finished_at TEXT,
    duration_ms INTEGER,
    error_message TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_schedule_runs_app_schedule_started
    ON schedule_runs(app_slug, schedule_name, started_at DESC);

  CREATE INDEX IF NOT EXISTS idx_schedule_runs_status
    ON schedule_runs(status);

  CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS app_error_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
    runtime_mode TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_detail TEXT,
    error_code TEXT,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_app_error_logs_app_mode_updated
    ON app_error_logs(app_slug, runtime_mode, updated_at DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_app_error_logs_app_mode_created
    ON app_error_logs(app_slug, runtime_mode, created_at DESC, id DESC);

  CREATE INDEX IF NOT EXISTS idx_app_error_logs_source
    ON app_error_logs(source_type, updated_at DESC, id DESC);

  CREATE TABLE IF NOT EXISTS operator_sessions (
    app_slug TEXT PRIMARY KEY REFERENCES apps(slug) ON DELETE CASCADE,
    messages_json TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS agent_runtime_sessions (
    usage_type TEXT NOT NULL,
    app_slug TEXT NOT NULL,
    provider_kind TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (usage_type, app_slug)
  );
`;

export const PLATFORM_MIGRATIONS: PlatformMigration[] = [
  {
    version: 1,
    name: 'baseline_schema',
    run: (db) => {
      db.run(PLATFORM_BASELINE_SCHEMA_SQL);
    },
  },
  {
    version: 9,
    name: 'mvp_schema_refresh',
    run: (db) => {
      db.run(PLATFORM_BASELINE_SCHEMA_SQL);
      ensureAgentSessionProviderKind(db);
      normalizeAgentRuntimeSessionsTable(db);
    },
  },
];

function hasTable(db: Database, tableName: string): boolean {
  const row = db
    .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name: string } | null;
  return row?.name === tableName;
}

function hasColumn(db: Database, tableName: string, columnName: string): boolean {
  const columns = db.query(`PRAGMA table_info(${tableName})`).all() as { name: string }[];
  return columns.some((column) => column.name === columnName);
}

function ensureAgentSessionProviderKind(db: Database): void {
  if (!hasTable(db, 'agent_sessions') || hasColumn(db, 'agent_sessions', 'provider_kind')) {
    return;
  }

  db.run(`
    ALTER TABLE agent_sessions ADD COLUMN provider_kind TEXT;

    UPDATE agent_sessions
    SET provider_kind = 'claude'
    WHERE provider_kind IS NULL AND sdk_session_id IS NOT NULL;
  `);
}

function normalizeAgentRuntimeSessionsTable(db: Database): void {
  if (!hasTable(db, 'agent_runtime_sessions')) {
    return;
  }

  const foreignKeys = db.query('PRAGMA foreign_key_list(agent_runtime_sessions)').all() as { table: string }[];
  const hasAppsForeignKey = foreignKeys.some((foreignKey) => foreignKey.table === 'apps');
  if (!hasAppsForeignKey) {
    return;
  }

  db.run(`
    ALTER TABLE agent_runtime_sessions RENAME TO agent_runtime_sessions_old;

    CREATE TABLE agent_runtime_sessions (
      usage_type TEXT NOT NULL,
      app_slug TEXT NOT NULL,
      provider_kind TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (usage_type, app_slug)
    );

    INSERT INTO agent_runtime_sessions (usage_type, app_slug, provider_kind, snapshot_json, updated_at)
    SELECT usage_type, app_slug, provider_kind, snapshot_json, updated_at
    FROM agent_runtime_sessions_old;

    DROP TABLE agent_runtime_sessions_old;
  `);
}

export function initPlatformMigrationsTable(db: Database): void {
  db.run(`
    CREATE TABLE IF NOT EXISTS _platform_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

export function getExecutedPlatformMigrations(db: Database): number[] {
  try {
    const rows = db.query('SELECT version FROM _platform_migrations ORDER BY version').all() as { version: number }[];
    return rows.map((row) => row.version);
  } catch {
    return [];
  }
}

export function recordPlatformMigration(db: Database, migration: PlatformMigration): void {
  db.query('INSERT INTO _platform_migrations (version, name) VALUES (?, ?)').run(
    migration.version,
    migration.name,
  );
}

export function runPlatformMigrations(db: Database): void {
  initPlatformMigrationsTable(db);
  const executed = getExecutedPlatformMigrations(db);
  const executedSet = new Set(executed);

  for (const migration of PLATFORM_MIGRATIONS) {
    if (executedSet.has(migration.version)) {
      continue;
    }

    try {
      migration.run(db);
      recordPlatformMigration(db, migration);
      console.log(`[platform] Executed migration ${migration.version}: ${migration.name}`);
    } catch (err: any) {
      console.error(`[platform] Failed to execute migration ${migration.version}: ${migration.name}`, err);
      throw err;
    }
  }
}
