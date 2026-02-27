import { describe, test, expect, afterEach } from 'bun:test';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestWorkspace,
  createTestApp,
  MIGRATION_CREATE_TODOS,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

describe('Auto CRUD routes (/fn/_db/*)', () => {
  let handle: TestWorkspaceHandle;
  let registry: any;

  afterEach(() => {
    try {
      registry?.shutdownAll();
    } catch {
      // ignore cleanup errors
    }
    handle?.cleanup();
    registry = null;
  });

  test('CRUD works on /fn/_db/tables/:table and /:id', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'todo', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(handle.root));
    registry = runtimeRegistry;
    await startup;

    await app.request('/draft/apps/todo/reconcile', { method: 'POST' });

    const createRes = await app.request('http://localhost/draft/apps/todo/fn/_db/tables/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Task A' }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { data: { id: number; title: string } };
    expect(created.data.title).toBe('Task A');
    const id = created.data.id;
    expect(typeof id).toBe('number');

    const listRes = await app.request('http://localhost/draft/apps/todo/fn/_db/tables/todos');
    expect(listRes.status).toBe(200);
    const listed = await listRes.json() as { data: Array<{ id: number }> };
    expect(listed.data.some((row) => row.id === id)).toBe(true);

    const getRes = await app.request(`http://localhost/draft/apps/todo/fn/_db/tables/todos/${id}`);
    expect(getRes.status).toBe(200);
    const found = await getRes.json() as { data: { id: number; title: string } };
    expect(found.data.id).toBe(id);

    const patchRes = await app.request(`http://localhost/draft/apps/todo/fn/_db/tables/todos/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: 1 }),
    });
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json() as { data: { done: number } };
    expect(patched.data.done).toBe(1);

    const deleteRes = await app.request(`http://localhost/draft/apps/todo/fn/_db/tables/todos/${id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    expect((await deleteRes.json() as { success: boolean }).success).toBe(true);

    const missingRes = await app.request(`http://localhost/draft/apps/todo/fn/_db/tables/todos/${id}`);
    expect(missingRes.status).toBe(404);
  });
});
