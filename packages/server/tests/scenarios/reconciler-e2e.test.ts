import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { Database } from 'bun:sqlite';
import { DraftReconciler } from '../../src/core/draft-reconciler';
import { Verifier } from '../../src/core/verifier';
import { Publisher } from '../../src/core/publisher';
import {
  createTestWorkspace,
  createTestApp,
  commitAll,
  addMigration,
  modifyMigration,
  setAppSpec,
  openDraftDb,
  openStableDb,
  gitExec,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
  SEED_TODOS_SQL,
  SEED_TODOS_JSON,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('End-to-end Reconciler Scenarios', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  // --- Scenario 9.1 ---
  describe('9.1: New App -> DraftReconcile -> query -> modify -> re-reconcile', () => {
    test('full draft development cycle', () => {
      handle = createTestWorkspace();

      // Step 1: Create app with migration + seed (uncommitted)
      createTestApp(handle.root, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_seed.sql': SEED_TODOS_SQL },
      });

      // Step 2: Verify state is draft_only
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('draft_only');

      // Step 3: Draft reconcile
      const reconciler = new DraftReconciler(handle.workspace);
      const result1 = reconciler.reconcile('todos');
      expect(result1.success).toBe(true);

      // Step 4: Query draft DB — seed data present
      let db = openDraftDb(handle.root, 'todos');
      let rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
      expect(rows).toHaveLength(2);
      expect(rows[0].title).toBe('Buy milk');
      expect(rows[1].title).toBe('Write tests');
      db.close();

      // Step 5: Add new migration
      addMigration(handle.root, 'todos', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      // Step 6: Re-reconcile
      const result2 = reconciler.reconcile('todos');
      expect(result2.success).toBe(true);
      expect(result2.migrations).toContain('001_init.sql');
      expect(result2.migrations).toContain('002_add_priority.sql');

      // Step 7: Draft DB rebuilt — new column exists, seed data re-loaded
      db = openDraftDb(handle.root, 'todos');
      const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('priority');

      rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
      expect(rows).toHaveLength(2); // Seed data re-loaded after rebuild
      db.close();
    });
  });

  // --- Scenario 9.2 ---
  describe('9.2: Draft only -> Publish -> verify stable state', () => {
    test('publish from draft creates full stable environment', () => {
      handle = createTestWorkspace();

      // Step 1: Create app (uncommitted)
      createTestApp(handle.root, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_seed.sql': SEED_TODOS_SQL },
      });
      handle.workspace.refreshAppState('todos');

      // Step 2: State is draft_only
      expect(handle.workspace.getAppState('todos')).toBe('draft_only');

      // Step 3: Publish
      const publisher = new Publisher(handle.workspace);
      const result = publisher.publish('todos');
      expect(result.success).toBe(true);

      // Step 4: Stable DB exists
      const stableDbPath = join(handle.root, 'data', 'apps', 'todos', 'db.sqlite');
      expect(existsSync(stableDbPath)).toBe(true);

      // Step 5: _migrations table has version 1
      const db = openStableDb(handle.root, 'todos');
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);

      // Step 6: Table structure exists in stable (Publisher runs migrations only, not seeds)
      const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='todos'").all();
      expect(tables).toHaveLength(1);
      db.close();

      // Step 7: Git log shows publish commit
      const log = gitExec(handle.root, ['log', '--oneline']);
      expect(log).toContain('publish: todos');

      // Step 8: Draft DB removed
      const draftDbPath = join(handle.root, 'draft', 'apps', 'todos', 'db.sqlite');
      expect(existsSync(draftDbPath)).toBe(false);

      // Step 9: State is stable
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('stable');
    });
  });

  // --- Scenario 9.3 ---
  describe('9.3: Stable + new migration -> DraftReconcile -> Verify -> Publish', () => {
    test('incremental development after initial publish', () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (establish stable)
      createTestApp(handle.root, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      publisher.publish('todos');

      // Step 2: Add new migration (not committed)
      addMigration(handle.root, 'todos', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      // Step 3: State is stable_draft
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('stable_draft');

      // Step 4: Draft reconcile — draft DB has both migrations
      const reconciler = new DraftReconciler(handle.workspace);
      const reconcileResult = reconciler.reconcile('todos');
      expect(reconcileResult.success).toBe(true);
      expect(reconcileResult.migrations).toContain('002_add_priority.sql');

      // Step 5: Verify passes
      const verifier = new Verifier(handle.workspace);
      const verifyResult = verifier.verify('todos');
      expect(verifyResult.success).toBe(true);
      expect(verifyResult.migrationsToApply).toEqual(['002_add_priority.sql']);

      // Step 6: Publish
      const publishResult = publisher.publish('todos');
      expect(publishResult.success).toBe(true);
      expect(publishResult.migrationsApplied).toContain('002_add_priority.sql');

      // Step 7: Stable DB has both migrations + priority column
      const db = openStableDb(handle.root, 'todos');
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1, 2]);

      const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
      expect(cols.map((c) => c.name)).toContain('priority');
      db.close();

      // Step 8: Backup exists
      const backupPath = join(handle.root, 'data', 'apps', 'todos', 'db.sqlite.bak');
      expect(existsSync(backupPath)).toBe(true);

      // Step 9: State is stable
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('stable');
    });
  });

  // --- Scenario 9.4 ---
  describe('9.4: Modify committed migration -> Verify -> immutability error', () => {
    test('committed migration modification detected', () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (creates stable DB + git commit)
      createTestApp(handle.root, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      publisher.publish('todos');

      // Step 2: Modify committed migration file
      modifyMigration(handle.root, 'todos', '001_init.sql', 'CREATE TABLE changed (id INTEGER PRIMARY KEY);');

      // Step 3: State is stable_draft (modified file detected by git)
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('stable_draft');

      // Step 4: Verify should fail with immutability error
      const verifier = new Verifier(handle.workspace);
      const result = verifier.verify('todos');
      expect(result.success).toBe(false);
      expect(result.error).toContain('immutable');
      expect(result.error).toContain('001_init.sql');
    });
  });

  // --- Scenario 9.5 ---
  describe('9.5: status: deleted -> state detection and operation rejection', () => {
    test('deleted app detected and all operations rejected', () => {
      handle = createTestWorkspace();

      // Step 1: Create app marked as deleted
      createTestApp(handle.root, 'todos', {
        spec: { description: 'old app', status: 'deleted' },
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      // Step 2: State is deleted
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('deleted');

      // Step 3: All operations should be rejected
      const reconciler = new DraftReconciler(handle.workspace);
      expect(() => reconciler.reconcile('todos')).toThrow(/deleted/);

      const publisher = new Publisher(handle.workspace);
      expect(() => publisher.publish('todos')).toThrow(/deleted/);
    });
  });

  // --- Scenario 9.6 ---
  describe('9.6: Publish with bad SQL -> backup restore', () => {
    test('failed publish restores stable database', () => {
      handle = createTestWorkspace();

      // Step 1: Create app and publish (establish stable)
      createTestApp(handle.root, 'todos', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('todos');
      const publisher = new Publisher(handle.workspace);
      publisher.publish('todos');

      // Step 2: Insert canary row into stable DB
      const appCtx = handle.workspace.getOrCreateApp('todos')!;
      appCtx.stableDb.exec("INSERT INTO todos (id, title) VALUES (999, 'canary')");
      appCtx.closeStable();

      // Step 3: Add bad migration (not committed)
      addMigration(handle.root, 'todos', '002_bad.sql', MIGRATION_BAD_SQL);

      // Step 4: State is stable_draft
      handle.workspace.refreshAppState('todos');
      expect(handle.workspace.getAppState('todos')).toBe('stable_draft');

      const commitsBefore = gitExec(handle.root, ['log', '--oneline']).trim().split('\n').length;

      // Step 5: Publish should fail
      const result = publisher.publish('todos');
      expect(result.success).toBe(false);

      // Step 6: Canary row still present (stable DB restored from backup)
      const db = openStableDb(handle.root, 'todos');
      const canary = db.query('SELECT * FROM todos WHERE id = 999').get() as { title: string } | null;
      expect(canary).toBeDefined();
      expect(canary!.title).toBe('canary');

      // Step 7: _migrations still only has version 1
      const versions = db.query('SELECT version FROM _migrations ORDER BY version').all() as { version: number }[];
      expect(versions.map((v) => v.version)).toEqual([1]);
      db.close();

      // Step 8: No new git commit
      const commitsAfter = gitExec(handle.root, ['log', '--oneline']).trim().split('\n').length;
      expect(commitsAfter).toBe(commitsBefore);
    });
  });
});
