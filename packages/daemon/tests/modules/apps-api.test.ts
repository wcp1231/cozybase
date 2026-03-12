import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestWorkspace,
  createTestApp,
  createStableDb,
  addMigration,
  modifyMigration,
  setAppSpec,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  TEST_UI_PAGES_JSON,
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
      expect(body.data.slug).toBe('newapp');
      expect(body.data.description).toBe('My new app');
      expect(body.data.current_version).toBe(1);
      expect(body.data.published_version).toBe(0);
      expect(body.data.stableStatus).toBeNull();
      expect(body.data.hasDraft).toBe(true);
      expect(body.data.api_key).toMatch(/^cb_/);
      expect(body.data.files).toBeArray();
      expect(body.data.files.length).toBeGreaterThan(0);
    });

    test('starts draft runtime for newly created apps so draft UI routes can resolve', async () => {
      handle = createTestWorkspace();
      const { app, startup } = createServer(createTestConfig(handle.root));
      await startup;

      const createRes = await app.request(jsonReq('/api/v1/apps', 'POST', { name: 'newapp' }));
      expect(createRes.status).toBe(201);

      const uiDir = join(handle.root, 'draft', 'newapp', 'ui');
      mkdirSync(uiDir, { recursive: true });
      writeFileSync(join(uiDir, 'pages.json'), JSON.stringify({ pages: [] }), 'utf-8');

      const uiRes = await app.request('/draft/apps/newapp/ui');
      expect(uiRes.status).toBe(200);
      expect((await jsonBody(uiRes)).data).toEqual({ pages: [] });
    });
  });

  describe('GET /draft/apps/:appSlug/ui auto-prepare', () => {
    test('prepares draft environment for a stable-only app and serves draft UI', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      handle.workspace.refreshAppState('myapp');
      expect(handle.workspace.getAppState('myapp')).toEqual({
        stableStatus: 'running',
        hasDraft: false,
      });

      const { app, startup } = createServer(createTestConfig(handle.root));
      await startup;

      const appRes = await app.request('/api/v1/apps/myapp');
      const appData = (await jsonBody(appRes)).data;
      expect(appData.current_version).toBe(1);
      expect(appData.published_version).toBe(1);

      const uiRes = await app.request('/draft/apps/myapp/ui');
      expect(uiRes.status).toBe(200);
      expect((await jsonBody(uiRes)).data).toEqual(JSON.parse(TEST_UI_PAGES_JSON));
    });

    test('materializes an existing draft runtime on demand when draft state is not exported yet', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      addMigration(handle, 'myapp', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);
      handle.workspace.refreshAppState('myapp');

      const { app, registry, startup } = createServer(createTestConfig(handle.root));
      await startup;

      expect(registry.get('myapp', 'draft')).toBeUndefined();

      const uiRes = await app.request('/draft/apps/myapp/ui');
      expect(uiRes.status).toBe(200);
      expect((await jsonBody(uiRes)).data).toEqual(JSON.parse(TEST_UI_PAGES_JSON));
    });

    test('returns an explicit error when auto-prepare fails', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        ui: TEST_UI_PAGES_JSON,
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      modifyMigration(handle, 'myapp', '001_init.sql', 'CREATE TABLE broken (');
      handle.workspace.refreshAppState('myapp');

      const { app, startup } = createServer(createTestConfig(handle.root));
      await startup;

      const uiRes = await app.request('/draft/apps/myapp/ui');
      expect(uiRes.status).toBe(500);

      const body = await jsonBody(uiRes);
      expect(body.error.code).toBe('DRAFT_PREPARE_FAILED');
      expect(body.error.message).toContain('Migration failed');
    });
  });

  describe('Console API', () => {
    test('returns console summary, errors, schedules, and runs for an app', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: {
          'jobs.ts': `
export async function run() {
  return { ok: true };
}
`,
        },
        spec: {
          description: 'test',
          schedules: [
            { name: 'nightly', cron: '*/5 * * * *', function: 'jobs:run', enabled: true },
          ],
        },
      });

      const { app, startup } = createServer(createTestConfig(handle.root));
      await startup;
      const rebuildRes = await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
      expect((await jsonBody(rebuildRes)).data.success).toBe(true);
      const publishRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
      expect((await jsonBody(publishRes)).data.success).toBe(true);

      const repo = handle.workspace.getPlatformRepo();
      repo.appErrorLogs.create({
        appSlug: 'myapp',
        runtimeMode: 'stable',
        sourceType: 'schedule',
        sourceDetail: 'schedule:nightly',
        errorCode: 'SCHEDULE_ERROR',
        errorMessage: 'nightly failed',
      });
      repo.scheduleRuns.create({
        appSlug: 'myapp',
        scheduleName: 'nightly',
        runtimeMode: 'stable',
        triggerMode: 'manual',
        status: 'error',
        functionRef: 'jobs:run',
        errorMessage: 'nightly failed',
      });

      const consoleRes = await app.request('/api/v1/apps/myapp/console?mode=stable');
      expect(consoleRes.status).toBe(200);
      const consoleBody = await jsonBody(consoleRes);
      expect(consoleBody.data.error_summary.total_24h).toBe(1);
      expect(consoleBody.data.error_summary.by_source.schedule).toBe(1);
      expect(consoleBody.data.schedules_summary.failing_names).toEqual(['nightly']);

      const errorsRes = await app.request('/api/v1/apps/myapp/errors?mode=stable&source_type=schedule&limit=10');
      expect(errorsRes.status).toBe(200);
      const errorsBody = await jsonBody(errorsRes);
      expect(errorsBody.data.errors).toHaveLength(1);
      expect(errorsBody.data.errors[0].error_message).toBe('nightly failed');

      const schedulesRes = await app.request('/api/v1/apps/myapp/schedules?mode=stable');
      expect(schedulesRes.status).toBe(200);
      const schedulesBody = await jsonBody(schedulesRes);
      expect(schedulesBody.data.schedules).toHaveLength(1);
      expect(schedulesBody.data.schedules[0].name).toBe('nightly');
      expect(schedulesBody.data.schedules[0].next_run).toBeTruthy();
      expect(schedulesBody.data.schedules[0].last_run.status).toBe('error');

      const runsRes = await app.request('/api/v1/apps/myapp/schedules/nightly/runs?mode=stable&limit=10');
      expect(runsRes.status).toBe(200);
      const runsBody = await jsonBody(runsRes);
      expect(runsBody.data.runs).toHaveLength(1);
      expect(runsBody.data.runs[0].status).toBe('error');
    });

    test('returns 404 for schedule runs of an unknown schedule', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        spec: {
          description: 'test',
          stable_status: 'running',
          schedules: [],
        },
      });

      const { app, startup } = createServer(createTestConfig(handle.root));
      await startup;

      const runsRes = await app.request('/api/v1/apps/myapp/schedules/missing/runs?mode=stable&limit=10');
      expect(runsRes.status).toBe(404);
      const body = await jsonBody(runsRes);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /apps/:slug', () => {
    test('updates display_name metadata', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        displayName: 'Old Name',
      });

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PATCH', { display_name: '  New Name  ' }));
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.slug).toBe('myapp');
      expect(body.data.displayName).toBe('New Name');
      expect(handle.workspace.getPlatformRepo().apps.findBySlug('myapp')?.display_name).toBe('New Name');
    });

    test('rejects patch requests with no supported fields', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PATCH', {}));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
    });

    test('rejects non-string display_name', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request(jsonReq('/api/v1/apps/myapp', 'PATCH', { display_name: 123 }));
      expect(res.status).toBe(400);

      const body = await jsonBody(res);
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('display_name');
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

    test('PUT /apps/:name reports needs_rebuild based on changed file paths', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        functions: {
          'hello.ts': 'export async function GET() { return { v: 1 }; }',
        },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));
      const appSnapshot = await jsonBody(await app.request('/api/v1/apps/myapp'));
      const appYaml = appSnapshot.data.files.find((file: { path: string; content: string }) => file.path === 'app.yaml')?.content;
      if (typeof appYaml !== 'string') {
        throw new Error('Expected app.yaml to exist in test app snapshot');
      }

      const hotOnlyRes = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 1,
        files: [
          { path: 'app.yaml', content: appYaml },
          { path: 'functions/hello.ts', content: 'export async function GET() { return { v: 2 }; }' },
        ],
      }));
      expect(hotOnlyRes.status).toBe(200);
      expect((await jsonBody(hotOnlyRes)).data.needs_rebuild).toBe(false);

      const rebuildRes = await app.request(jsonReq('/api/v1/apps/myapp', 'PUT', {
        base_version: 2,
        files: [
          { path: 'app.yaml', content: 'description: changed\n' },
          { path: 'functions/hello.ts', content: 'export async function GET() { return { v: 3 }; }' },
        ],
      }));
      expect(rebuildRes.status).toBe(200);
      expect((await jsonBody(rebuildRes)).data.needs_rebuild).toBe(true);
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
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
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
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
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

    test('GET /apps supports filtering by stable mode', async () => {
      handle = createTestWorkspace();

      createTestApp(handle, 'stable-only', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'stable-only', [MIGRATION_CREATE_TODOS], [1]);

      createTestApp(handle, 'draft-only', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      createTestApp(handle, 'hybrid', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'hybrid', [MIGRATION_CREATE_TODOS], [1]);
      addMigration(handle, 'hybrid', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps?mode=stable');
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.map((item: any) => item.slug).sort()).toEqual(['hybrid', 'stable-only']);
    });

    test('GET /apps supports filtering by draft mode', async () => {
      handle = createTestWorkspace();

      createTestApp(handle, 'stable-only', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'stable-only', [MIGRATION_CREATE_TODOS], [1]);

      createTestApp(handle, 'draft-only', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      createTestApp(handle, 'hybrid', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'hybrid', [MIGRATION_CREATE_TODOS], [1]);
      addMigration(handle, 'hybrid', '002_add_priority.sql', MIGRATION_ADD_PRIORITY);

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/api/v1/apps?mode=draft');
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.map((item: any) => item.slug).sort()).toEqual(['draft-only', 'hybrid']);
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
      expect(body.data.slug).toBe('myapp');
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

  describe('schedule trigger API', () => {
    test('schedule manager follows publish/start/stop lifecycle', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: {
          'jobs.ts': `
export async function run() { return { ok: true }; }
`,
        },
      });
      setAppSpec(handle, 'myapp', {
        description: 'test',
        schedules: [
          { name: 'daily', cron: '*/5 * * * *', function: 'jobs:run' },
        ],
      });

      const { app, scheduleManager } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
      const publishRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
      expect((await jsonBody(publishRes)).data.success).toBe(true);
      expect(scheduleManager.getLoadedScheduleNames('myapp')).toEqual(['daily']);

      const stopRes = await app.request('/api/v1/apps/myapp/stop', { method: 'POST' });
      expect(stopRes.status).toBe(200);
      expect(scheduleManager.getLoadedScheduleNames('myapp')).toEqual([]);

      const startRes = await app.request('/api/v1/apps/myapp/start', { method: 'POST' });
      expect(startRes.status).toBe(200);
      expect(scheduleManager.getLoadedScheduleNames('myapp')).toEqual(['daily']);

      setAppSpec(handle, 'myapp', {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'weekly', cron: '*/10 * * * *', function: 'jobs:run' },
        ],
      });

      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
      const publishRes2 = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
      expect((await jsonBody(publishRes2)).data.success).toBe(true);
      expect(scheduleManager.getLoadedScheduleNames('myapp')).toEqual(['weekly']);
    });

    test('POST /draft/apps/:appSlug/schedule/:scheduleName/trigger executes schedule in draft mode', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: {
          'jobs.ts': `
export async function run(ctx) {
  return { mode: ctx.mode, trigger: ctx.trigger, hasRequest: ctx.req !== undefined };
}
`,
        },
      });
      setAppSpec(handle, 'myapp', {
        description: 'test',
        schedules: [
          { name: 'daily', cron: '*/5 * * * *', function: 'jobs:run' },
        ],
      });

      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

      const triggerRes = await app.request('/draft/apps/myapp/schedule/daily/trigger', {
        method: 'POST',
      });
      expect(triggerRes.status).toBe(200);

      const body = await jsonBody(triggerRes);
      expect(body.data.status).toBe('success');
      expect(body.data.runtimeMode).toBe('draft');
      expect(body.data.result).toEqual({ mode: 'draft', trigger: 'cron', hasRequest: false });
    });

    test('POST /stable/apps/:appSlug/schedule/:scheduleName/trigger executes schedule in stable mode', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: {
          'jobs.ts': `
export async function run(ctx) {
  return { mode: ctx.mode, trigger: ctx.trigger, hasRequest: ctx.req !== undefined };
}
`,
        },
      });
      setAppSpec(handle, 'myapp', {
        description: 'test',
        schedules: [
          { name: 'daily', cron: '*/5 * * * *', function: 'jobs:run' },
        ],
      });

      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
      const publishRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
      expect((await jsonBody(publishRes)).data.success).toBe(true);

      const triggerRes = await app.request('/stable/apps/myapp/schedule/daily/trigger', {
        method: 'POST',
      });
      expect(triggerRes.status).toBe(200);

      const body = await jsonBody(triggerRes);
      expect(body.data.status).toBe('success');
      expect(body.data.runtimeMode).toBe('stable');
      expect(body.data.result).toEqual({ mode: 'stable', trigger: 'cron', hasRequest: false });
    });

    test('returns 404 when schedule does not exist', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

      const triggerRes = await app.request('/draft/apps/myapp/schedule/not-exists/trigger', {
        method: 'POST',
      });
      expect(triggerRes.status).toBe(404);

      const body = await jsonBody(triggerRes);
      expect(body.error.code).toBe('NOT_FOUND');
    });

    test('reports execution error when handler export is missing', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        functions: {
          'jobs.ts': `
export async function existing() {
  return { ok: true };
}
`,
        },
      });
      setAppSpec(handle, 'myapp', {
        description: 'test',
        schedules: [
          { name: 'daily', cron: '*/5 * * * *', function: 'jobs:missingExport' },
        ],
      });

      const { app } = createServer(createTestConfig(handle.root));
      await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

      const triggerRes = await app.request('/draft/apps/myapp/schedule/daily/trigger', {
        method: 'POST',
      });
      expect(triggerRes.status).toBe(200);

      const body = await jsonBody(triggerRes);
      expect(body.data.status).toBe('error');
      expect(body.data.errorMessage).toContain('missingExport');
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
      expect(fetched.slug).toBe('lifecycle');
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
      expect(fileData.needs_rebuild).toBe(false);

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

  describe('draft rebuild route', () => {
    test('POST /draft/apps/:appSlug/rebuild materializes the draft environment', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      handle.workspace.refreshAppState('myapp');

      const { app } = createServer(createTestConfig(handle.root));

      const res = await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
      expect(res.status).toBe(200);

      const body = await jsonBody(res);
      expect(body.data.success).toBe(true);
    });

    test('PUT /apps/:name/files/* reports needs_rebuild for migration edits', async () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const { app } = createServer(createTestConfig(handle.root));
      const res = await app.request(jsonReq(
        '/api/v1/apps/myapp/files/migrations/001_init.sql',
        'PUT',
        { content: `${MIGRATION_CREATE_TODOS}\n-- comment` },
      ));

      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.data.status).toBe('updated');
      expect(body.data.needs_rebuild).toBe(true);
    });
  });
});
