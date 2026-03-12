import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { AppContext } from '../../src/core/app-context';

describe('AppContext', () => {
  let tempDir: string;
  let ctx: AppContext;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ac-test-'));
    const dataDir = join(tempDir, 'data');
    const draftDir = join(tempDir, 'draft');

    ctx = new AppContext('testapp', dataDir, draftDir);
  });

  afterEach(() => {
    ctx.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test('lazily initializes stableDb on first access', () => {
    expect(existsSync(ctx.stableDbPath)).toBe(false);

    const db = ctx.stableDb;
    expect(db).toBeDefined();
    expect(existsSync(ctx.stableDbPath)).toBe(true);

    // Verify WAL mode
    const mode = db.query('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(mode.journal_mode).toBe('wal');
  });

  test('lazily initializes draftDb on first access', () => {
    expect(existsSync(ctx.draftDbPath)).toBe(false);

    const db = ctx.draftDb;
    expect(db).toBeDefined();
    expect(existsSync(ctx.draftDbPath)).toBe(true);
  });

  test('resetDraft closes connection and deletes database files', () => {
    // Trigger creation
    ctx.draftDb.run('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    expect(existsSync(ctx.draftDbPath)).toBe(true);

    ctx.resetDraft();

    expect(existsSync(ctx.draftDbPath)).toBe(false);

    // Re-access should create a new DB
    const db = ctx.draftDb;
    expect(db).toBeDefined();
    expect(existsSync(ctx.draftDbPath)).toBe(true);

    // Old table should not exist in new DB
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='test'").all();
    expect(tables).toHaveLength(0);
  });

  test('resetDraft cleans up WAL and SHM files', () => {
    // Trigger creation and write to generate WAL
    ctx.draftDb.run('CREATE TABLE test (id INTEGER PRIMARY KEY)');
    ctx.draftDb.run('INSERT INTO test (id) VALUES (1)');

    const walPath = ctx.draftDbPath + '-wal';
    const shmPath = ctx.draftDbPath + '-shm';

    ctx.resetDraft();

    expect(existsSync(ctx.draftDbPath)).toBe(false);
    expect(existsSync(walPath)).toBe(false);
    expect(existsSync(shmPath)).toBe(false);
  });

  test('closeStable only closes stable connection', () => {
    // Access both
    ctx.stableDb.run('CREATE TABLE s (id INTEGER PRIMARY KEY)');
    ctx.draftDb.run('CREATE TABLE d (id INTEGER PRIMARY KEY)');

    ctx.closeStable();

    // Draft should still work fine
    const draftTables = ctx.draftDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='d'").all();
    expect(draftTables).toHaveLength(1);

    // Re-accessing stableDb should create new connection
    const stableDb = ctx.stableDb;
    // New connection won't have the old table because the DB file is still there
    const stableTables = stableDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='s'").all();
    expect(stableTables).toHaveLength(1);
  });

  test('close shuts down both connections', () => {
    ctx.stableDb.run('CREATE TABLE s (id INTEGER PRIMARY KEY)');
    ctx.draftDb.run('CREATE TABLE d (id INTEGER PRIMARY KEY)');

    ctx.close();

    // Files should still exist (close doesn't delete), but connections are released
    expect(existsSync(ctx.stableDbPath)).toBe(true);
    expect(existsSync(ctx.draftDbPath)).toBe(true);
  });
});
