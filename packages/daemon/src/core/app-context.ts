import { Database } from 'bun:sqlite';
import { mkdirSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';

export class AppContext {
  readonly name: string;
  readonly stableDataDir: string;
  readonly stableDbPath: string;
  readonly draftDataDir: string;
  readonly draftDbPath: string;

  private _stableDb: Database | null = null;
  private _draftDb: Database | null = null;

  constructor(
    name: string,
    dataRootDir: string,
    draftRootDir: string,
  ) {
    this.name = name;
    this.stableDataDir = join(dataRootDir, name);
    this.stableDbPath = join(this.stableDataDir, 'db.sqlite');
    this.draftDataDir = join(draftRootDir, name);
    this.draftDbPath = join(this.draftDataDir, 'db.sqlite');
  }

  /** Get the app's Stable SQLite database connection (lazy initialized) */
  get stableDb(): Database {
    if (!this._stableDb) {
      mkdirSync(dirname(this.stableDbPath), { recursive: true });
      this._stableDb = new Database(this.stableDbPath);
      this._stableDb.exec('PRAGMA journal_mode = WAL');
      this._stableDb.exec('PRAGMA foreign_keys = ON');
    }
    return this._stableDb;
  }

  /** Get the app's Draft SQLite database connection (lazy initialized) */
  get draftDb(): Database {
    if (!this._draftDb) {
      mkdirSync(dirname(this.draftDbPath), { recursive: true });
      this._draftDb = new Database(this.draftDbPath);
      this._draftDb.exec('PRAGMA journal_mode = WAL');
      this._draftDb.exec('PRAGMA foreign_keys = ON');
    }
    return this._draftDb;
  }

  /** Return whether the draft environment has been materialized by rebuild */
  hasDraftRebuildState(): boolean {
    return existsSync(join(this.draftDataDir, '.rebuild-state.json'));
  }

  /** Backward-compatible alias for older call sites. */
  hasDraftReconcileState(): boolean {
    return this.hasDraftRebuildState();
  }

  /** Destroy and reset the draft database (for draft rebuild) */
  resetDraft(): void {
    // Close existing connection
    if (this._draftDb) {
      this._draftDb.close();
      this._draftDb = null;
    }

    // Delete draft database files
    if (existsSync(this.draftDbPath)) {
      unlinkSync(this.draftDbPath);
    }
    const walPath = this.draftDbPath + '-wal';
    if (existsSync(walPath)) {
      unlinkSync(walPath);
    }
    const shmPath = this.draftDbPath + '-shm';
    if (existsSync(shmPath)) {
      unlinkSync(shmPath);
    }
  }

  /** Close the stable database connection */
  closeStable(): void {
    if (this._stableDb) {
      this._stableDb.close();
      this._stableDb = null;
    }
  }

  /** Close all resources held by this AppContext */
  close(): void {
    if (this._stableDb) {
      this._stableDb.close();
      this._stableDb = null;
    }
    if (this._draftDb) {
      this._draftDb.close();
      this._draftDb = null;
    }
  }
}
