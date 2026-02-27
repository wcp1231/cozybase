/**
 * SQL Endpoint (`POST /{mode}/apps/{appName}/db/_sql`) — Integration Tests
 *
 * Tests permission control, result set limits, and error format
 * through the full HTTP endpoint stack.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import {
  createTestWorkspace,
  createTestApp,
  MIGRATION_CREATE_TODOS,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';
import { createServer } from '../../src/server';

let handle: TestWorkspaceHandle;
let _registry: any;

afterEach(() => {
  if (_registry) {
    try { _registry.shutdownAll(); } catch { /* ignore */ }
    _registry = null;
  }
  handle?.cleanup();
});

async function createApp() {
  handle = createTestWorkspace();

  createTestApp(handle, 'todo', {
    migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
  });

  const config = {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: handle.root,
    jwtSecret: 'test-secret',
  };

  const { app, registry, startup } = createServer(config);
  _registry = registry;

  // Wait for startup to register apps in the registry
  await startup;

  // Reconcile through HTTP to create draft DB and restart draft in registry
  await app.request('/draft/apps/todo/reconcile', { method: 'POST' });

  return { app, registry };
}

async function sqlRequest(
  app: any,
  mode: string,
  appName: string,
  sql: string,
): Promise<Response> {
  return app.request(`http://localhost/${mode}/apps/${appName}/db/_sql`, {
    method: 'POST',
    body: JSON.stringify({ sql }),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /{mode}/apps/{appName}/db/_sql', () => {
  test('SELECT returns columns and rows', async () => {
    const { app } = await createApp();

    // Insert a row so columns are visible in the result
    await sqlRequest(app, 'draft', 'todo', "INSERT INTO todos (title) VALUES ('test task')");

    const res = await sqlRequest(app, 'draft', 'todo', 'SELECT * FROM todos');
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.data.columns).toContain('id');
    expect(body.data.columns).toContain('title');
    expect(body.data.rowCount).toBeGreaterThanOrEqual(1);
  });

  test('DML allowed in draft mode', async () => {
    const { app } = await createApp();

    const res = await sqlRequest(
      app,
      'draft',
      'todo',
      "INSERT INTO todos (title) VALUES ('test task')",
    );
    expect(res.status).toBe(200);
  });

  test('DML denied in stable mode with SQL_NOT_ALLOWED', async () => {
    const { app } = await createApp();

    // Publish to create stable version registered in registry
    await app.request('/draft/apps/todo/publish', { method: 'POST' });

    const res = await sqlRequest(
      app,
      'stable',
      'todo',
      "INSERT INTO todos (title) VALUES ('hacked')",
    );
    expect(res.status).toBe(403);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_NOT_ALLOWED');
  });

  test('DDL denied with SQL_NOT_ALLOWED', async () => {
    const { app } = await createApp();

    const res = await sqlRequest(app, 'draft', 'todo', 'DROP TABLE todos');
    expect(res.status).toBe(403);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_NOT_ALLOWED');
  });

  test('multiple statements denied with SQL_INVALID', async () => {
    const { app } = await createApp();

    const res = await sqlRequest(
      app,
      'draft',
      'todo',
      'SELECT 1; DROP TABLE todos',
    );
    expect(res.status).toBe(400);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_INVALID');
  });

  test('missing sql field returns SQL_INVALID', async () => {
    const { app } = await createApp();

    const res = await app.request('http://localhost/draft/apps/todo/db/_sql', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_INVALID');
  });

  test('invalid SQL returns SQL_INVALID', async () => {
    const { app } = await createApp();

    const res = await sqlRequest(
      app,
      'draft',
      'todo',
      'SELECT * FROM nonexistent_table_xyz',
    );
    expect(res.status).toBe(400);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_INVALID');
  });

  test('result set limited to 1000 rows', async () => {
    const { app, registry } = await createApp();

    // Insert many rows via the registry's draft DB directly (same WAL file)
    const entry = registry.get('todo', 'draft');
    if (entry?.db) {
      for (let i = 0; i < 1100; i++) {
        entry.db.query("INSERT INTO todos (title) VALUES (?)").run(`Task ${i}`);
      }
    }

    const res = await sqlRequest(app, 'draft', 'todo', 'SELECT * FROM todos');
    expect(res.status).toBe(200);

    const body = await res.json() as any;
    expect(body.data.rowCount).toBe(1000);
  });

  test('invalid JSON body returns SQL_INVALID', async () => {
    const { app } = await createApp();

    const res = await app.request('http://localhost/draft/apps/todo/db/_sql', {
      method: 'POST',
      body: 'not-valid-json{{{',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);

    const body = await res.json() as any;
    expect(body.error.code).toBe('SQL_INVALID');
  });
});
