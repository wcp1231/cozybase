import type { Database } from 'bun:sqlite';

/**
 * Platform database migrations
 * Each migration is numbered and will be executed in order.
 * Migrations are tracked in the _platform_migrations table.
 */

export interface PlatformMigration {
  version: number;
  name: string;
  up: (db: Database) => void;
}

/**
 * All platform migrations in order
 */
export const PLATFORM_MIGRATIONS: PlatformMigration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
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
      `);
    },
  },
  {
    version: 2,
    name: 'agent_session_provider_kind',
    up: (db) => {
      db.exec(`
        ALTER TABLE agent_sessions ADD COLUMN provider_kind TEXT;
        UPDATE agent_sessions
        SET provider_kind = 'claude'
        WHERE provider_kind IS NULL AND sdk_session_id IS NOT NULL;
      `);
    },
  },
];

/**
 * Initialize the platform migrations tracking table
 */
export function initPlatformMigrationsTable(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _platform_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      executed_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

/**
 * Get list of already-executed platform migration versions
 */
export function getExecutedPlatformMigrations(db: Database): number[] {
  try {
    const rows = db.query('SELECT version FROM _platform_migrations ORDER BY version').all() as { version: number }[];
    return rows.map((r) => r.version);
  } catch {
    return [];
  }
}

/**
 * Record a platform migration as executed
 */
export function recordPlatformMigration(db: Database, migration: PlatformMigration): void {
  db.query('INSERT INTO _platform_migrations (version, name) VALUES (?, ?)').run(
    migration.version,
    migration.name,
  );
}

/**
 * Run all pending platform migrations
 */
export function runPlatformMigrations(db: Database): void {
  initPlatformMigrationsTable(db);
  const executed = getExecutedPlatformMigrations(db);
  const executedSet = new Set(executed);

  const pending = PLATFORM_MIGRATIONS.filter((m) => !executedSet.has(m.version));

  for (const migration of pending) {
    try {
      migration.up(db);
      recordPlatformMigration(db, migration);
      console.log(`[platform] Executed migration ${migration.version}: ${migration.name}`);
    } catch (err: any) {
      console.error(`[platform] Failed to execute migration ${migration.version}: ${migration.name}`, err);
      throw err;
    }
  }
}
