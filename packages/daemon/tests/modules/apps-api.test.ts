import { describe, test, expect, afterEach } from 'bun:test';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestWorkspace,
  createTestApp,
  MIGRATION_CREATE_TODOS,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

// --- Helpers ---

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

async function jsonBody(res: Response): Promise<any> {
  return res.json();
}

function jsonReq(path: string, method: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe('Management API (/api/v1/apps)', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  // --- POST /api/v1/apps: body validation ---

  describe('POST /api/v1/apps validation', () => {
    test('rejects missing name field', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { description: 'no name' }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('name');
    });

    test('rejects empty name string', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { name: '  ' }));
      expect(res.status).toBe(400);
    });

    test('rejects invalid name format (special chars)', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { name: 'bad name!' }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('INVALID_NAME');
    });

    test('rejects app names with _ prefix', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { name: '_platform' }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('INVALID_NAME');
    });

    test('rejects duplicate name', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { name: 'myapp' }));
      expect(res.status).toBe(409);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('ALREADY_EXISTS');
    });

    test('creates app successfully with valid input', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps', 'POST', { name: 'newapp', description: 'My new app' }));
      expect(res.status).toBe(201);

      const body = await jsonBody(res);
      expect(body.data.name).toBe('newapp');
      expect(body.data.description).toBe('My new app');
      expect(body.data.current_version).toBe(1);
      expect(body.data.published_version).toBe(0);
      expect(body.data.stableStatus).toBeNull();
      expect(body.data.hasDraft).toBe(true);
      expect(body.data.api_key).toMatch(/^cb_/);
      expect(body.data.files).toBeArray();
      expect(body.data.files.length).toBeGreaterThan(0);
    });
  });

  // --- Path traversal safety ---

  describe('path traversal protection', () => {
    test('PUT /apps/:name rejects files with .. in path', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [
          { path: '../../../etc/passwd', content: 'malicious' },
        ],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('Unsafe');
    });

    test('PUT /apps/:name rejects absolute paths', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [
          { path: '/etc/passwd', content: 'malicious' },
        ],
      }));
      expect(res.status).toBe(400);
    });

    test('PUT /apps/:name/files/* with .. in URL is blocked by HTTP normalization', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));

      // HTTP URL normalization resolves ../../ before routing, so the request
      // hits a non-matching route → 404. This is the first defense layer.
      // The second layer (assertSafeFilePath in updateFile) is validated
      // by the updateApp body-based tests above.
      const res = await app.request(jsonReq(
        '/api/v1/apps/myapp/files/../../../etc/passwd',
        'PUT',
        { content: 'malicious' },
      ));
      expect(res.status).toBe(404);
    });

    test('PUT /apps/:name rejects paths with backslashes', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [
          { path: 'functions\\..\\..\\etc\\passwd', content: 'malicious' },
        ],
      }));
      expect(res.status).toBe(400);
    });
  });

  // --- Version conflict ---

  describe('optimistic locking (version conflict)', () => {
    test('PUT /apps/:name rejects stale base_version', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      // base_version 999 doesn't match current_version 1
      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 999,
        files: [
          { path: 'app.yaml', content: 'description: updated\n' },
        ],
      }));
      expect(res.status).toBe(409);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('VERSION_CONFLICT');
    });

    test('PUT /apps/:name succeeds with correct base_version', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [
          { path: 'app.yaml', content: 'description: updated\n' },
          { path: 'migrations/001_init.sql', content: MIGRATION_CREATE_TODOS },
        ],
      }));
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.current_version).toBe(2);
    });
  });

  // --- Immutability ---

  describe('immutable file protection', () => {
    test('PUT /apps/:name rejects modification of immutable migration', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      // Publish to make migrations immutable
      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/reconcile', { method: 'POST' });
      const pubRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
      expect((await jsonBody(pubRes)).data.success).toBe(true);

      // Get current state
      const getRes = await app.request('/api/v1/apps/myapp');
      const appData = (await jsonBody(getRes)).data;

      // Try to modify the immutable migration
      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: appData.current_version,
        files: [
          { path: 'app.yaml', content: 'description: ok\n' },
          { path: 'migrations/001_init.sql', content: 'CREATE TABLE changed (id INTEGER);' },
        ],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('IMMUTABLE_FILE');
    });

    test('PUT /apps/:name/files/migrations/* rejects immutable single file', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/reconcile', { method: 'POST' });
      await app.request('/draft/apps/myapp/publish', { method: 'POST' });

      const res = await app.request(jsonReq(
        '/api/v1/apps/myapp/files/migrations/001_init.sql',
        'PUT',
        { content: 'CREATE TABLE changed (id INTEGER);' },
      ));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('IMMUTABLE_FILE');
    });
  });

  // --- PUT body validation ---

  describe('PUT body validation', () => {
    test('PUT /apps/:name rejects missing base_version', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        files: [{ path: 'app.yaml', content: 'test' }],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('PUT /apps/:name rejects null element in files array', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [null],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('PUT /apps/:name rejects file entry missing content field', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [{ path: 'app.yaml' }],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('PUT /apps/:name rejects file entry with non-string path', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [{ path: 123, content: 'test' }],
      }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('PUT /apps/:name/files/* rejects missing content', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq(
        '/api/v1/apps/myapp/files/functions/hello.ts',
        'PUT',
        { notContent: 'wrong field' },
      ));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });
  });

  // --- GET / NOT_FOUND ---

  describe('GET endpoints', () => {
    test('GET /apps returns empty array when no apps', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps');
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data).toBeArray();
    });

    test('GET /apps/:name returns 404 for nonexistent app', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps/nonexistent');
      expect(res.status).toBe(404);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    test('GET /apps/:name returns app with files', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: { 'hello.ts': 'export async function GET() { return {}; }' },
      });

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps/myapp');
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.name).toBe('myapp');
      expect(body.data.files).toBeArray();
      expect(body.data.files.length).toBeGreaterThan(0);
    });
  });

  // --- DELETE ---

  describe('DELETE /apps/:name', () => {
    test('deletes an existing app', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));

      const delRes = await app.request('/api/v1/apps/myapp', { method: 'DELETE' });
      expect(delRes.status).toBe(200);

      // Verify it's gone
      const getRes = await app.request('/api/v1/apps/myapp');
      expect(getRes.status).toBe(404);
    });

    test('returns 404 for nonexistent app', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps/nonexistent', { method: 'DELETE' });
      expect(res.status).toBe(404);
    });
  });

  // --- Full CRUD flow ---

  describe('full CRUD lifecycle', () => {
    test('create → get → update → single-file-update → delete', async () => {
      handle = createTestWorkspace();
      const { app } = createServer(createTestConfig(handle.root));

      // 1. Create
      const createRes = await app.request(jsonReq('/api/v1/apps', 'POST', {
        name: 'lifecycle',
        description: 'CRUD test',
      }));
      expect(createRes.status).toBe(201);
      const created = (await jsonBody(createRes)).data;
      expect(created.current_version).toBe(1);

      // 2. Get
      const getRes = await app.request('/api/v1/apps/lifecycle');
      expect(getRes.status).toBe(200);
      const fetched = (await jsonBody(getRes)).data;
      expect(fetched.name).toBe('lifecycle');
      expect(fetched.files.some((f: any) => f.path === 'app.yaml')).toBe(true);

      // 3. Whole-app update
      const updateRes = await app.request(jsonReq('/api/v1/apps/lifecycle', 'PUT', {
        base_version: 1,
        files: [
          { path: 'app.yaml', content: 'description: updated\n' },
          { path: 'migrations/001_init.sql', content: MIGRATION_CREATE_TODOS },
          { path: 'functions/hello.ts', content: 'export async function GET() { return { v: 2 }; }' },
        ],
      }));
      expect(updateRes.status).toBe(200);
      const updated = (await jsonBody(updateRes)).data;
      expect(updated.current_version).toBe(2);

      // 4. Single file update
      const fileRes = await app.request(jsonReq(
        '/api/v1/apps/lifecycle/files/functions/hello.ts',
        'PUT',
        { content: 'export async function GET() { return { v: 3 }; }' },
      ));
      expect(fileRes.status).toBe(200);
      const fileData = (await jsonBody(fileRes)).data;
      expect(fileData.content).toContain('v: 3');

      // Version should have incremented again
      const getRes2 = await app.request('/api/v1/apps/lifecycle');
      const fetched2 = (await jsonBody(getRes2)).data;
      expect(fetched2.current_version).toBe(3);

      // 5. Delete
      const delRes = await app.request('/api/v1/apps/lifecycle', { method: 'DELETE' });
      expect(delRes.status).toBe(200);

      const getRes3 = await app.request('/api/v1/apps/lifecycle');
      expect(getRes3.status).toBe(404);
    });
  });
});
