import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { MigrationRunner } from '../../src/core/migration-runner';
import { MIGRATION_CREATE_TODOS, MIGRATION_ADD_PRIORITY, MIGRATION_BAD_SQL } from '../helpers/test-workspace';

describe('MigrationRunner', () => {
  let runner: MigrationRunner;
  let tempDir: string;

  beforeEach(() => {
    runner = new MigrationRunner();
    tempDir = mkdtempSync(join(tmpdir(), 'mr-test-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  // --- scanMigrations ---

  describe('scanMigrations', () => {
    test('returns sorted migrations from a directory with valid files', () => {
      mkdirSync(tempDir, { recursive: true });
      writeFileSync(join(tempDir, '001_init.sql'), MIGRATION_CREATE_TODOS);
      writeFileSync(join(tempDir, '002_add_col.sql'), MIGRATION_ADD_PRIORITY);

      const result = runner.scanMigrations(tempDir);

      expect(result).toHaveLength(2);
      expect(result[0].version).toBe(1);
      expect(result[0].filename).toBe('001_init.sql');
      expect(result[0].name).toBe('001_init');
      expect(result[0].sql).toContain('CREATE TABLE todos');
      expect(result[1].version).toBe(2);
      expect(result[1].filename).toBe('002_add_col.sql');
    });

    test('throws on invalid .sql migration filenames', () => {
      writeFileSync(join(tempDir, '001_init.sql'), MIGRATION_CREATE_TODOS);
      writeFileSync(join(tempDir, 'bad_name.sql'), 'SELECT 1');

      expect(() => runner.scanMigrations(tempDir)).toThrow('Invalid migration filename');
    });

    test('skips non-sql files silently', () => {
      writeFileSync(join(tempDir, '001_init.sql'), MIGRATION_CREATE_TODOS);
      writeFileSync(join(tempDir, 'readme.txt'), 'not a migration');

      const result = runner.scanMigrations(tempDir);

      expect(result).toHaveLength(1);
      expect(result[0].filename).toBe('001_init.sql');
    });

    test('returns empty array for non-existent directory', () => {
      const result = runner.scanMigrations('/nonexistent/path');
      expect(result).toEqual([]);
    });

    test('sorts by version number', () => {
      writeFileSync(join(tempDir, '002_second.sql'), MIGRATION_ADD_PRIORITY);
      writeFileSync(join(tempDir, '001_first.sql'), MIGRATION_CREATE_TODOS);

      const result = runner.scanMigrations(tempDir);

      expect(result[0].version).toBe(1);
      expect(result[1].version).toBe(2);
    });
  });

  // --- executeMigrations ---

  describe('executeMigrations', () => {
    test('executes all migrations on a fresh database', () => {
      const db = new Database(':memory:');
      const migrations = [
        { version: 1, name: '001_init', filename: '001_init.sql', path: '', sql: MIGRATION_CREATE_TODOS },
        { version: 2, name: '002_add_col', filename: '002_add_col.sql', path: '', sql: MIGRATION_ADD_PRIORITY },
      ];

      const result = runner.executeMigrations(db, migrations);

      expect(result.success).toBe(true);
      expect(result.executed).toEqual(['001_init.sql', '002_add_col.sql']);

      // Verify table exists with new column
      const columns = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('title');
      expect(colNames).toContain('priority');

      db.close();
    });

    test('returns partial result on SQL error', () => {
      const db = new Database(':memory:');
      const migrations = [
        { version: 1, name: '001_init', filename: '001_init.sql', path: '', sql: MIGRATION_CREATE_TODOS },
        { version: 2, name: '002_bad', filename: '002_bad.sql', path: '', sql: MIGRATION_BAD_SQL },
        { version: 3, name: '003_never', filename: '003_never.sql', path: '', sql: 'SELECT 1' },
      ];

      const result = runner.executeMigrations(db, migrations);

      expect(result.success).toBe(false);
      expect(result.executed).toEqual(['001_init.sql']);
      expect(result.failedMigration).toBe('002_bad.sql');
      expect(result.error).toBeDefined();

      db.close();
    });
  });

  // --- _migrations table operations ---

  describe('initMigrationsTable / getExecutedVersions / recordMigration', () => {
    test('initMigrationsTable creates the _migrations table', () => {
      const db = new Database(':memory:');
      runner.initMigrationsTable(db);

      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'").all();
      expect(tables).toHaveLength(1);

      db.close();
    });

    test('getExecutedVersions returns empty array when table does not exist', () => {
      const db = new Database(':memory:');
      const versions = runner.getExecutedVersions(db);
      expect(versions).toEqual([]);
      db.close();
    });

    test('recordMigration + getExecutedVersions round-trip', () => {
      const db = new Database(':memory:');
      runner.initMigrationsTable(db);

      runner.recordMigration(db, { version: 1, name: '001_init', filename: '001_init.sql', path: '', sql: '' });
      runner.recordMigration(db, { version: 2, name: '002_add', filename: '002_add.sql', path: '', sql: '' });

      const versions = runner.getExecutedVersions(db);
      expect(versions).toEqual([1, 2]);

      db.close();
    });
  });

  // --- getPendingMigrations ---

  describe('getPendingMigrations', () => {
    test('filters out already-executed versions', () => {
      const all = [
        { version: 1, name: '001', filename: '001.sql', path: '', sql: '' },
        { version: 2, name: '002', filename: '002.sql', path: '', sql: '' },
        { version: 3, name: '003', filename: '003.sql', path: '', sql: '' },
      ];

      const pending = runner.getPendingMigrations(all, [1, 2]);

      expect(pending).toHaveLength(1);
      expect(pending[0].version).toBe(3);
    });

    test('returns all when none are executed', () => {
      const all = [
        { version: 1, name: '001', filename: '001.sql', path: '', sql: '' },
        { version: 2, name: '002', filename: '002.sql', path: '', sql: '' },
      ];

      const pending = runner.getPendingMigrations(all, []);
      expect(pending).toHaveLength(2);
    });
  });
});
