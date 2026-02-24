import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import type { Config } from '../config';

export class DbPool {
  private connections = new Map<string, Database>();
  private platformDb: Database | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /** Get or create the platform-level database */
  getPlatformDb(): Database {
    if (!this.platformDb) {
      const dbPath = join(this.config.dataDir, 'cozybase.sqlite');
      mkdirSync(dirname(dbPath), { recursive: true });
      this.platformDb = new Database(dbPath);
      this.platformDb.exec('PRAGMA journal_mode = WAL');
      this.platformDb.exec('PRAGMA foreign_keys = ON');
      this.initPlatformSchema();
    }
    return this.platformDb;
  }

  /** Get or create the database for a specific app (keyed by appName) */
  getAppDb(appName: string): Database {
    if (this.connections.has(appName)) {
      return this.connections.get(appName)!;
    }

    const dbPath = join(this.config.dataDir, 'apps', appName, 'db.sqlite');
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    this.connections.set(appName, db);
    return db;
  }

  /** Close and remove an app database connection */
  closeAppDb(appName: string): void {
    const db = this.connections.get(appName);
    if (db) {
      db.close();
      this.connections.delete(appName);
    }
  }

  /** Close all connections */
  closeAll(): void {
    for (const db of this.connections.values()) {
      db.close();
    }
    this.connections.clear();
    if (this.platformDb) {
      this.platformDb.close();
      this.platformDb = null;
    }
  }

  private initPlatformSchema(): void {
    const db = this.platformDb!;

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
}
