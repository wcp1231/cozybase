import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { Publisher } from '../../src/core/publisher';
import {
  createTestWorkspace,
  createTestApp,
  addMigration,
  createStableDb,
  openStableDb,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('Publisher', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  describe('publish draft_only app', () => {
    test('creates stable DB, records migrations, marks immutable, cleans draft', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('draft_only');

      const publisher = new Publisher(handle.workspace);
      const result = await publisher.publish('myapp');

      expect(result.success).toBe(true);
      expect(result.migrationsApplied).toContain('001_init.sql');

      // 1. Stable DB exists
      const stableDbPath = join(handle.root, 'stable', 'myapp', 'db.sqlite');
      expect(existsSync(stableDbPath)).toBe(true);

      // 2. _migrations table has version 1
      const db = new Database(stableDbPath);
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);

      // 3. Table exists in stable DB
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").all();
      expect(tables).toHaveLength(1);
      db.close();

      // 4. Migrations marked immutable in platform DB
      const platformDb = handle.workspace.getPlatformDb();
      const migFile = platformDb.query(
        "SELECT immutable FROM app_files WHERE app_name = 'myapp' AND path LIKE 'migrations/001%'",
      ).get() as { immutable: number };
      expect(migFile.immutable).toBe(1);

      // 5. published_version updated
      const appRow = platformDb.query(
        "SELECT published_version, current_version FROM apps WHERE name = 'myapp'",
      ).get() as { published_version: number; current_version: number };
      expect(appRow.published_version).toBe(appRow.current_version);

      // 6. Draft DB cleaned up
      const draftDbPath = join(handle.root, 'draft', 'myapp', 'db.sqlite');
      expect(existsSync(draftDbPath)).toBe(false);

      // 7. State is now stable
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable');
    });
  });

  describe('publish stable_draft app', () => {
    test('incremental migration + backup created', async () => {
      handle = createTestWorkspace();

      // Phase 1: Create app and publish
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('myapp');

      // Phase 2: Add new migration
      addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable_draft');

      // Publish again
      const result = await publisher.publish('myapp');

      expect(result.success).toBe(true);
      expect(result.migrationsApplied).toContain('002_add_col.sql');

      // 1. Both migrations recorded
      const db = openStableDb(handle.root, 'myapp');
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1, 2]);

      // 2. New column exists
      const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('priority');
      db.close();

      // 3. Backup file exists
      const backupPath = join(handle.root, 'stable', 'myapp', 'db.sqlite.bak');
      expect(existsSync(backupPath)).toBe(true);

      // 4. Both migrations marked immutable
      const platformDb = handle.workspace.getPlatformDb();
      const immutableCount = platformDb.query(
        "SELECT COUNT(*) as cnt FROM app_files WHERE app_name = 'myapp' AND path LIKE 'migrations/%' AND immutable = 1",
      ).get() as { cnt: number };
      expect(immutableCount.cnt).toBe(2);

      // 5. Draft cleaned, state stable
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable');
    });
  });

  describe('publish failure rollback', () => {
    test('restores stable DB from backup when migration fails', async () => {
      handle = createTestWorkspace();

      // Phase 1: Create and publish
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      await publisher.publish('myapp');

      // Insert canary row
      const appCtx = handle.workspace.getOrCreateApp('myapp')!;
      appCtx.stableDb.exec("INSERT INTO todos (id, title) VALUES (999, 'canary')");
      // Close the stable connection before the next publish attempt
      appCtx.closeStable();

      // Phase 2: Add bad migration
      addMigration(handle, 'myapp', '002_bad.sql', MIGRATION_BAD_SQL);
      handle.workspace.refreshAppState('myapp');

      // Publish should fail
      const result = await publisher.publish('myapp');

      expect(result.success).toBe(false);
      expect(result.error).toContain('002_bad.sql');

      // Stable DB should be restored with canary row
      const db = openStableDb(handle.root, 'myapp');
      const canary = db.query('SELECT * FROM todos WHERE id = 999').get() as { title: string } | null;
      expect(canary).toBeDefined();
      expect(canary!.title).toBe('canary');

      // _migrations still only has version 1
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);
      db.close();
    });

    test('for new app failure: deletes failed stable DB', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_bad.sql': MIGRATION_BAD_SQL },
      });
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      const result = await publisher.publish('myapp');

      expect(result.success).toBe(false);

      // Stable DB should not exist
      const stablePath = join(handle.root, 'stable', 'myapp', 'db.sqlite');
      expect(existsSync(stablePath)).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('throws BadRequestError for deleted app', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        spec: { description: 'test', status: 'deleted' },
      });
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      await expect(publisher.publish('myapp')).rejects.toThrow(/deleted/);
    });

    test('throws BadRequestError for stable app with no draft changes', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      await expect(publisher.publish('myapp')).rejects.toThrow(/no draft changes/);
    });
  });
});
