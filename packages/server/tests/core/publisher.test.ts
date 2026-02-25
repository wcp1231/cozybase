import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { Publisher } from '../../src/core/publisher';
import {
  createTestWorkspace,
  createTestApp,
  commitAll,
  addMigration,
  createStableDb,
  openStableDb,
  gitExec,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
  SEED_TODOS_SQL,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('Publisher', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  describe('publish draft_only app', () => {
    test('creates stable DB, records migrations, commits, cleans draft', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('draft_only');

      const publisher = new Publisher(handle.workspace);
      const result = publisher.publish('myapp');

      expect(result.success).toBe(true);
      expect(result.migrationsApplied).toContain('001_init.sql');

      // 1. Stable DB exists
      const stableDbPath = join(handle.root, 'data', 'apps', 'myapp', 'db.sqlite');
      expect(existsSync(stableDbPath)).toBe(true);

      // 2. _migrations table has version 1
      const db = new Database(stableDbPath);
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);

      // 3. Table exists in stable DB
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").all();
      expect(tables).toHaveLength(1);
      db.close();

      // 4. Git commit exists
      const log = gitExec(handle.root, ['log', '--oneline']);
      expect(log).toContain('publish: myapp');

      // 5. Draft DB cleaned up
      const draftDbPath = join(handle.root, 'draft', 'apps', 'myapp', 'db.sqlite');
      expect(existsSync(draftDbPath)).toBe(false);

      // 6. State is now stable
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable');
    });
  });

  describe('publish stable_draft app', () => {
    test('incremental migration + backup created', () => {
      handle = createTestWorkspace();

      // Phase 1: Create app and publish
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      publisher.publish('myapp');

      // Phase 2: Add new migration (not committed)
      addMigration(handle.root, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable_draft');

      // Publish again
      const result = publisher.publish('myapp');

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
      const backupPath = join(handle.root, 'data', 'apps', 'myapp', 'db.sqlite.bak');
      expect(existsSync(backupPath)).toBe(true);

      // 4. New git commit
      const log = gitExec(handle.root, ['log', '--oneline']);
      const publishCommits = log.split('\n').filter((l: string) => l.includes('publish: myapp'));
      expect(publishCommits.length).toBeGreaterThanOrEqual(2);

      // 5. Draft cleaned, state stable
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toBe('stable');
    });
  });

  describe('publish failure rollback', () => {
    test('restores stable DB from backup when migration fails', () => {
      handle = createTestWorkspace();

      // Phase 1: Create and publish
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');
      const publisher = new Publisher(handle.workspace);
      publisher.publish('myapp');

      // Insert canary row
      const appCtx = handle.workspace.getOrCreateApp('myapp')!;
      appCtx.stableDb.exec("INSERT INTO todos (id, title) VALUES (999, 'canary')");
      // Close the stable connection before the next publish attempt
      appCtx.closeStable();

      // Phase 2: Add bad migration
      addMigration(handle.root, 'myapp', '002_bad.sql', MIGRATION_BAD_SQL);
      handle.workspace.refreshAppState('myapp');

      const commitsBefore = gitExec(handle.root, ['log', '--oneline']).trim().split('\n').length;

      // Publish should fail
      const result = publisher.publish('myapp');

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

      // No new git commit
      const commitsAfter = gitExec(handle.root, ['log', '--oneline']).trim().split('\n').length;
      expect(commitsAfter).toBe(commitsBefore);
    });

    test('for new app failure: deletes failed stable DB', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_bad.sql': MIGRATION_BAD_SQL },
      });
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      const result = publisher.publish('myapp');

      expect(result.success).toBe(false);

      // Stable DB should not exist
      const stablePath = join(handle.root, 'data', 'apps', 'myapp', 'db.sqlite');
      expect(existsSync(stablePath)).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('throws BadRequestError for deleted app', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        spec: { description: 'test', status: 'deleted' },
      });
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      expect(() => publisher.publish('myapp')).toThrow(/deleted/);
    });

    test('throws BadRequestError for stable app with no draft changes', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');
      createStableDb(handle.root, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      handle.workspace.refreshAppState('myapp');

      const publisher = new Publisher(handle.workspace);
      expect(() => publisher.publish('myapp')).toThrow(/no draft changes/);
    });
  });
});
