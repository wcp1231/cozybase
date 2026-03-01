/**
 * EmbeddedBackend — Integration Tests
 *
 * Tests app lifecycle, file sync (with immutable protection),
 * and the execute_sql permission model via full EmbeddedBackend.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { Hono } from 'hono';
import {
  createTestWorkspace,
  createTestApp,
  createStableDb,
  addMigration,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';
import { EmbeddedBackend } from '../../src/mcp/embedded-backend';
import { DraftReconciler } from '../../src/core/draft-reconciler';
import { Verifier } from '../../src/core/verifier';
import { Publisher } from '../../src/core/publisher';
import { AppRegistry } from '@cozybase/runtime';

let handle: TestWorkspaceHandle;

afterEach(() => {
  handle?.cleanup();
});

function createBackend(h: TestWorkspaceHandle) {
  const draftReconciler = new DraftReconciler(h.workspace);
  const verifier = new Verifier(h.workspace);
  const publisher = new Publisher(h.workspace);
  const registry = new AppRegistry();
  const app = new Hono(); // Minimal app for callApi (can be extended)
  return new EmbeddedBackend(h.workspace, draftReconciler, verifier, publisher, registry, app);
}

describe('EmbeddedBackend — App Lifecycle', () => {
  test('createApp returns snapshot with template files', async () => {
    handle = createTestWorkspace();
    const backend = createBackend(handle);

    const snapshot = await backend.createApp('blog', 'A blog app');

    expect(snapshot.name).toBe('blog');
    expect(snapshot.description).toBe('A blog app');
    expect(snapshot.current_version).toBeGreaterThanOrEqual(1);
    expect(snapshot.files.length).toBeGreaterThan(0);
    // Should have at least app.yaml
    expect(snapshot.files.some((f) => f.path === 'app.yaml')).toBe(true);
  });

  test('listApps returns all apps', async () => {
    handle = createTestWorkspace();
    const backend = createBackend(handle);

    await backend.createApp('app1');
    await backend.createApp('app2');

    const apps = await backend.listApps();
    const names = apps.map((a) => a.name);
    expect(names).toContain('app1');
    expect(names).toContain('app2');
  });

  test('fetchApp returns complete snapshot with files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);

    const snapshot = await backend.fetchApp('todo');

    expect(snapshot.name).toBe('todo');
    expect(snapshot.files.length).toBeGreaterThan(0);
    expect(snapshot.files.some((f) => f.path === 'migrations/001_init.sql')).toBe(true);
  });

  test('deleteApp removes the app', async () => {
    handle = createTestWorkspace();
    const backend = createBackend(handle);
    await backend.createApp('temp');

    await backend.deleteApp('temp');

    const apps = await backend.listApps();
    expect(apps.find((a) => a.name === 'temp')).toBeUndefined();
  });
});

describe('EmbeddedBackend — File Sync', () => {
  test('pushFiles adds new files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo');
    const backend = createBackend(handle);

    const result = await backend.pushFiles('todo', [
      { path: 'app.yaml', content: 'name: todo' },
      { path: 'functions/hello.ts', content: 'export default () => "hi"' },
    ]);

    expect(result.changes.added).toContain('functions/hello.ts');
    expect(result.files).toContain('functions/hello.ts');
  });

  test('pushFiles detects modified files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);

    const result = await backend.pushFiles('todo', [
      { path: 'app.yaml', content: 'name: todo\nversion: 2' },
      { path: 'migrations/001_init.sql', content: MIGRATION_CREATE_TODOS },
    ]);

    expect(result.changes.modified).toContain('app.yaml');
  });

  test('pushFiles deletes missing non-immutable files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'old.ts': 'export default () => {}' },
    });
    const backend = createBackend(handle);

    // Push without the old function file — it should be deleted
    const result = await backend.pushFiles('todo', [
      { path: 'app.yaml', content: 'name: todo' },
      { path: 'migrations/001_init.sql', content: MIGRATION_CREATE_TODOS },
    ]);

    expect(result.changes.deleted).toContain('functions/old.ts');
  });

  test('pushFiles rejects modification of immutable files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });

    // Mark migration as immutable (simulating a published migration)
    const db = handle.workspace.getPlatformDb();
    db.query(
      "UPDATE app_files SET immutable = 1 WHERE app_name = 'todo' AND path = 'migrations/001_init.sql'",
    ).run();

    const backend = createBackend(handle);

    expect(
      backend.pushFiles('todo', [
        { path: 'app.yaml', content: 'name: todo' },
        { path: 'migrations/001_init.sql', content: 'CHANGED CONTENT' },
      ]),
    ).rejects.toThrow(/immutable/i);
  });

  test('pushFile returns created for new files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo');
    const backend = createBackend(handle);

    const status = await backend.pushFile('todo', 'functions/new.ts', 'export default () => {}');
    expect(status).toBe('created');
  });

  test('pushFile returns updated for existing files', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      functions: { 'hello.ts': 'export default () => "old"' },
    });
    const backend = createBackend(handle);

    const status = await backend.pushFile('todo', 'functions/hello.ts', 'export default () => "new"');
    expect(status).toBe('updated');
  });
});

describe('EmbeddedBackend — execute_sql permission model', () => {
  test('SELECT allowed in draft', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);

    // Refresh workspace state so reconciler can find the app
    handle.workspace.refreshAppState('todo');

    // Reconcile to create draft DB
    await backend.reconcile('todo');

    // Insert a row so we can verify the columns in the result
    await backend.executeSql('todo', "INSERT INTO todos (title) VALUES ('test')", 'draft');

    const result = await backend.executeSql('todo', 'SELECT * FROM todos', 'draft');
    expect(result.columns).toContain('id');
    expect(result.rowCount).toBeGreaterThanOrEqual(1);
  });

  test('DML allowed in draft', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);
    handle.workspace.refreshAppState('todo');
    await backend.reconcile('todo');

    const result = await backend.executeSql(
      'todo',
      "INSERT INTO todos (title) VALUES ('test')",
      'draft',
    );
    // DML should succeed (no error)
    expect(result).toBeDefined();
  });

  test('DML denied in stable', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });

    // Create a stable DB with the migration already applied
    createStableDb(handle, 'todo', [MIGRATION_CREATE_TODOS], [1]);

    const backend = createBackend(handle);
    handle.workspace.refreshAppState('todo');

    expect(
      backend.executeSql('todo', "DELETE FROM todos WHERE id = 1", 'stable'),
    ).rejects.toThrow(/not allowed/i);
  });

  test('DDL always denied', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);
    handle.workspace.refreshAppState('todo');
    await backend.reconcile('todo');

    expect(
      backend.executeSql('todo', 'DROP TABLE todos', 'draft'),
    ).rejects.toThrow(/forbidden/i);
  });

  test('multiple statements denied', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const backend = createBackend(handle);
    handle.workspace.refreshAppState('todo');
    await backend.reconcile('todo');

    expect(
      backend.executeSql('todo', 'SELECT 1; DROP TABLE todos', 'draft'),
    ).rejects.toThrow(/Multiple/i);
  });

  test('result set limited to 1000 rows', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: {
        '001_init.sql': `
          CREATE TABLE nums (n INTEGER);
        `,
      },
    });
    const backend = createBackend(handle);
    handle.workspace.refreshAppState('todo');
    await backend.reconcile('todo');
    const insertSql = Array.from({ length: 1100 }, (_, i) =>
      `INSERT INTO nums (n) VALUES (${i})`,
    ).join('; ');

    // Use direct DB to insert (since multi-statement is blocked by validateSql)
    const appContext = handle.workspace.getOrCreateApp('todo');
    if (appContext) {
      for (let i = 0; i < 1100; i++) {
        appContext.draftDb.query('INSERT INTO nums (n) VALUES (?)').run(i);
      }
    }

    const result = await backend.executeSql('todo', 'SELECT * FROM nums', 'draft');
    expect(result.rowCount).toBe(1000);
  });
});

// ---- Registry restart after DB recreation ----
// Regression tests for stale DB handle bug:
// reconcile() and publish() destroy and recreate database files.
// Without registry.restart(), the AppRegistry holds stale Database handles
// pointing to deleted files, causing "disk I/O error" on subsequent function calls.

function createBackendWithRegistry(h: TestWorkspaceHandle) {
  const registry = new AppRegistry();
  const backend = new EmbeddedBackend(
    h.workspace,
    new DraftReconciler(h.workspace),
    new Verifier(h.workspace),
    new Publisher(h.workspace),
    registry,
    new Hono(),
  );
  return { backend, registry };
}

describe('EmbeddedBackend — registry restart after DB recreation', () => {
  test('reconcile registers draft in runtime registry', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const { backend, registry } = createBackendWithRegistry(handle);
    handle.workspace.refreshAppState('todo');

    // Before reconcile, registry has no entry
    expect(registry.get('todo', 'draft')).toBeUndefined();

    await backend.reconcile('todo');

    // After reconcile, registry should have a running draft entry
    const entry = registry.get('todo', 'draft');
    expect(entry).toBeDefined();
    expect(entry!.status).toBe('running');
    expect(entry!.db).not.toBeNull();

    // Registry DB handle should be functional
    const rows = entry!.db!.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(rows.some((r) => r.name === 'todos')).toBe(true);
  });

  test('second reconcile refreshes draft registry entry (avoids stale DB handle)', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const { backend, registry } = createBackendWithRegistry(handle);
    handle.workspace.refreshAppState('todo');

    // First reconcile — registry gets draft DB handle
    await backend.reconcile('todo');
    const entry1 = registry.get('todo', 'draft');
    expect(entry1!.db).not.toBeNull();
    const db1 = entry1!.db;

    // Verify first reconcile worked
    entry1!.db!.query("INSERT INTO todos (title) VALUES ('test')").run();
    const rows1 = entry1!.db!.query('SELECT * FROM todos').all();
    expect(rows1).toHaveLength(1);

    // Add a new migration — this makes the app have a new draft
    addMigration(handle, 'todo', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('todo');

    // Second reconcile — resetDraft() deletes old DB, creates fresh one.
    // registry.restart() must be called to avoid stale handle.
    await backend.reconcile('todo');

    const entry2 = registry.get('todo', 'draft');
    expect(entry2).toBeDefined();
    expect(entry2!.status).toBe('running');
    expect(entry2!.db).not.toBeNull();

    // DB handle must be different (fresh connection after restart)
    expect(entry2!.db).not.toBe(db1);

    // Query through registry DB — would fail with "disk I/O error" if not restarted
    const cols = entry2!.db!.query('PRAGMA table_info(todos)').all() as { name: string }[];
    expect(cols.some((c) => c.name === 'priority')).toBe(true);
  });

  test('publish creates stable registry entry and stops draft', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const { backend, registry } = createBackendWithRegistry(handle);
    handle.workspace.refreshAppState('todo');

    // Reconcile to create draft DB (also starts draft in registry)
    await backend.reconcile('todo');
    expect(registry.get('todo', 'draft')?.status).toBe('running');

    // Publish — should create stable registry entry and stop draft
    const result = await backend.publish('todo');
    expect(result.success).toBe(true);

    // Stable registry should be running with a valid DB handle
    const stableEntry = registry.get('todo', 'stable');
    expect(stableEntry).toBeDefined();
    expect(stableEntry!.status).toBe('running');
    expect(stableEntry!.db).not.toBeNull();

    // Query through stable registry DB — should work (table exists with correct schema)
    const tables = stableEntry!.db!.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.some((t) => t.name === 'todos')).toBe(true);

    // Draft registry should be stopped (publish clears draft state)
    const draftEntry = registry.get('todo', 'draft');
    expect(draftEntry?.status).toBe('stopped');
  });

  test('second publish refreshes stable registry entry (avoids stale DB handle)', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    const { backend, registry } = createBackendWithRegistry(handle);
    handle.workspace.refreshAppState('todo');

    // First cycle: reconcile + publish
    await backend.reconcile('todo');
    const pub1 = await backend.publish('todo');
    expect(pub1.success).toBe(true);

    const stableEntry1 = registry.get('todo', 'stable');
    expect(stableEntry1!.db).not.toBeNull();
    const db1 = stableEntry1!.db;

    // Verify first publish schema
    const cols1 = stableEntry1!.db!.query('PRAGMA table_info(todos)').all() as { name: string }[];
    expect(cols1.some((c) => c.name === 'priority')).toBe(false);

    // Add new migration for second cycle
    addMigration(handle, 'todo', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('todo');

    // Second cycle: reconcile + publish
    await backend.reconcile('todo');
    const pub2 = await backend.publish('todo');
    expect(pub2.success).toBe(true);

    // Stable registry should have a fresh DB handle with updated schema
    const stableEntry2 = registry.get('todo', 'stable');
    expect(stableEntry2).toBeDefined();
    expect(stableEntry2!.status).toBe('running');
    expect(stableEntry2!.db).not.toBeNull();

    // DB handle must be different (fresh connection after restart)
    expect(stableEntry2!.db).not.toBe(db1);

    // Query through registry DB — would fail with stale handle if not restarted
    const cols2 = stableEntry2!.db!.query('PRAGMA table_info(todos)').all() as { name: string }[];
    expect(cols2.some((c) => c.name === 'priority')).toBe(true);
  });
});
