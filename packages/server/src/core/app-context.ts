import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import type { AppDefinition } from './workspace';

export class AppContext {
  readonly name: string;
  readonly specDir: string;
  readonly dataDir: string;
  readonly dbPath: string;

  private _definition: AppDefinition;
  private _db: Database | null = null;

  constructor(
    name: string,
    definition: AppDefinition,
    appsDir: string,
    dataRootDir: string,
  ) {
    this.name = name;
    this._definition = definition;
    this.specDir = join(appsDir, name);
    this.dataDir = join(dataRootDir, 'apps', name);
    this.dbPath = join(this.dataDir, 'db.sqlite');
  }

  get definition(): AppDefinition {
    return this._definition;
  }

  /** Update the app definition (called during reconcile) */
  reload(definition: AppDefinition): void {
    this._definition = definition;
  }

  /** Get the app's SQLite database connection (lazy initialized) */
  get db(): Database {
    if (!this._db) {
      mkdirSync(dirname(this.dbPath), { recursive: true });
      this._db = new Database(this.dbPath);
      this._db.exec('PRAGMA journal_mode = WAL');
      this._db.exec('PRAGMA foreign_keys = ON');
    }
    return this._db;
  }

  /** Close all resources held by this AppContext */
  close(): void {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
  }
}
