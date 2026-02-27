import { describe, test, expect, afterEach } from 'bun:test';
import { DraftReconciler } from '../../src/core/draft-reconciler';
import {
  createTestWorkspace,
  createTestApp,
  addMigration,
  createStableDb,
  openDraftDb,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
  SEED_TODOS_SQL,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('DraftReconciler', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('builds draft DB from migrations and seeds for draft_only app', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      seeds: { '01_seed.sql': SEED_TODOS_SQL },
    });
    handle.workspace.refreshAppState('myapp');

    const reconciler = new DraftReconciler(handle.workspace);
    const result = await reconciler.reconcile('myapp');

    expect(result.success).toBe(true);
    expect(result.migrations).toContain('001_init.sql');
    expect(result.seeds).toContain('01_seed.sql');

    // Verify draft DB has data
    const db = openDraftDb(handle.root, 'myapp');
    const rows = db.query('SELECT * FROM todos ORDER BY id').all() as { id: number; title: string }[];
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe('Buy milk');
    db.close();
  });

  test('re-reconcile after migration change rebuilds DB from scratch', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      seeds: { '01_seed.sql': SEED_TODOS_SQL },
    });
    handle.workspace.refreshAppState('myapp');

    const reconciler = new DraftReconciler(handle.workspace);

    // First reconcile
    await reconciler.reconcile('myapp');

    // Insert an extra row directly into draft DB
    const appContext = handle.workspace.getOrCreateApp('myapp')!;
    appContext.draftDb.exec("INSERT INTO todos (id, title) VALUES (999, 'Extra row')");
    const extraRow = appContext.draftDb.query('SELECT * FROM todos WHERE id = 999').get();
    expect(extraRow).toBeDefined();

    // Add a new migration (via DB)
    addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);

    // Second reconcile — should rebuild from scratch
    const result2 = await reconciler.reconcile('myapp');

    expect(result2.success).toBe(true);
    expect(result2.migrations).toContain('001_init.sql');
    expect(result2.migrations).toContain('002_add_col.sql');

    // Extra row should be gone (destructive rebuild)
    const db = openDraftDb(handle.root, 'myapp');
    const extra = db.query('SELECT * FROM todos WHERE id = 999').get();
    expect(extra).toBeNull();

    // But seed data should be re-loaded
    const seeds = db.query('SELECT * FROM todos ORDER BY id').all() as any[];
    expect(seeds).toHaveLength(2);

    // New column should exist
    const cols = db.query('PRAGMA table_info(todos)').all() as { name: string }[];
    expect(cols.map((c) => c.name)).toContain('priority');
    db.close();
  });

  test('works for stable_draft app', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    // Add new migration (increments current_version, state becomes stable_draft)
    addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('myapp');
    expect(handle.workspace.getAppState('myapp')).toBe('stable_draft');

    const reconciler = new DraftReconciler(handle.workspace);
    const result = await reconciler.reconcile('myapp');

    expect(result.success).toBe(true);
    expect(result.migrations).toContain('001_init.sql');
    expect(result.migrations).toContain('002_add_col.sql');
  });

  test('throws BadRequestError for deleted app', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: { description: 'test', status: 'deleted' },
    });
    handle.workspace.refreshAppState('myapp');

    const reconciler = new DraftReconciler(handle.workspace);
    expect(reconciler.reconcile('myapp')).rejects.toThrow(/deleted/);
  });

  test('throws BadRequestError for stable app with no draft changes', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
    handle.workspace.refreshAppState('myapp');
    expect(handle.workspace.getAppState('myapp')).toBe('stable');

    const reconciler = new DraftReconciler(handle.workspace);
    expect(reconciler.reconcile('myapp')).rejects.toThrow(/no draft changes/);
  });

  test('returns error when migration SQL fails', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_bad.sql': MIGRATION_BAD_SQL },
    });
    handle.workspace.refreshAppState('myapp');

    const reconciler = new DraftReconciler(handle.workspace);
    const result = await reconciler.reconcile('myapp');

    expect(result.success).toBe(false);
    expect(result.error).toContain('001_bad.sql');
  });

  test('returns error when seed loading fails', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      seeds: { '01_bad.sql': "INSERT INTO nonexistent_table (id) VALUES (1);" },
    });
    handle.workspace.refreshAppState('myapp');

    const reconciler = new DraftReconciler(handle.workspace);
    const result = await reconciler.reconcile('myapp');

    expect(result.success).toBe(false);
    expect(result.migrations).toContain('001_init.sql');
    expect(result.error).toContain('01_bad.sql');
  });
});
