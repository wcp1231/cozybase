import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

// --- Types ---

export interface MigrationFile {
  version: number;
  name: string;       // e.g. "001_create_todos"
  filename: string;   // e.g. "001_create_todos.sql"
  sql: string;        // file content
}

export interface MigrationResult {
  success: boolean;
  executed: string[];  // filenames of executed migrations
  error?: string;
  failedMigration?: string;
}

// --- Constants ---

const MIGRATION_PATTERN = /^(\d{3})_([a-z0-9_]+)\.sql$/;

// --- MigrationRunner ---

export class MigrationRunner {
  /** Build MigrationFile list from DB records (app_files query result) */
  static fromDbRecords(records: { path: string; content: string }[]): MigrationFile[] {
    const migrations: MigrationFile[] = [];
    let lastVersion = 0;

    // Sort by path to ensure order
    const sorted = [...records].sort((a, b) => a.path.localeCompare(b.path));

    for (const record of sorted) {
      // Extract filename from path (e.g. "migrations/001_init.sql" → "001_init.sql")
      const filename = record.path.replace(/^migrations\//, '');
      const match = filename.match(MIGRATION_PATTERN);
      if (!match) {
        if (filename.endsWith('.sql')) {
          throw new Error(
            `Invalid migration filename: ${filename} (expected {NNN}_{description}.sql format)`,
          );
        }
        continue;
      }

      const version = parseInt(match[1], 10);
      const name = basename(filename, '.sql');

      // Warn on non-consecutive versions
      if (lastVersion > 0 && version !== lastVersion + 1) {
        console.warn(`[migration] Non-consecutive version: ${filename} (expected ${String(lastVersion + 1).padStart(3, '0')})`);
      }
      lastVersion = version;

      migrations.push({ version, name, filename, sql: record.content });
    }

    return migrations;
  }

  /** Scan and sort migration files from a directory (used for filesystem migration) */
  scanMigrations(migrationsDir: string): MigrationFile[] {
    if (!existsSync(migrationsDir)) {
      return [];
    }

    const files = readdirSync(migrationsDir).sort();
    const migrations: MigrationFile[] = [];
    let lastVersion = 0;

    for (const filename of files) {
      const match = filename.match(MIGRATION_PATTERN);
      if (!match) {
        if (filename.endsWith('.sql')) {
          throw new Error(
            `Invalid migration filename: ${filename} (expected {NNN}_{description}.sql format)`,
          );
        }
        continue;
      }

      const version = parseInt(match[1], 10);
      const name = basename(filename, '.sql');
      const sql = readFileSync(join(migrationsDir, filename), 'utf-8');

      // Warn on non-consecutive versions
      if (lastVersion > 0 && version !== lastVersion + 1) {
        console.warn(`[migration] Non-consecutive version: ${filename} (expected ${String(lastVersion + 1).padStart(3, '0')})`);
      }
      lastVersion = version;

      migrations.push({ version, name, filename, sql });
    }

    return migrations;
  }

  /** Execute a list of migrations on the given database */
  executeMigrations(db: Database, migrations: MigrationFile[]): MigrationResult {
    const executed: string[] = [];

    for (const migration of migrations) {
      try {
        db.exec(migration.sql);
        executed.push(migration.filename);
      } catch (err: any) {
        return {
          success: false,
          executed,
          error: err.message,
          failedMigration: migration.filename,
        };
      }
    }

    return { success: true, executed };
  }

  /** Create the _migrations tracking table (for stable databases only) */
  initMigrationsTable(db: Database): void {
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  /** Get list of already-executed migration versions from _migrations table */
  getExecutedVersions(db: Database): number[] {
    try {
      const rows = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      return rows.map((r) => r.version);
    } catch {
      // Table doesn't exist yet
      return [];
    }
  }

  /** Record a migration as executed in the _migrations table */
  recordMigration(db: Database, migration: MigrationFile): void {
    db.query('INSERT INTO _migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
  }

  /** Filter migrations to only those not yet executed */
  getPendingMigrations(allMigrations: MigrationFile[], executedVersions: number[]): MigrationFile[] {
    const executedSet = new Set(executedVersions);
    return allMigrations.filter((m) => !executedSet.has(m.version));
  }
}
