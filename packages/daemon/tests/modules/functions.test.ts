import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { Database } from 'bun:sqlite';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestWorkspace,
  createTestApp,
  addFunction,
  setAppSpec,
  createStableDb,
  MIGRATION_CREATE_TODOS,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

// --- Test Fixtures ---

const FN_HEALTH = `
export async function GET(ctx) {
  return { status: "ok", app: ctx.app.name, mode: ctx.mode };
}
`;

const FN_HEALTH_V2 = `
export async function GET(ctx) {
  return { status: "ok", app: ctx.app.name, mode: ctx.mode, version: 2 };
}
`;

const FN_BROKEN = `
export async function GET(ctx) {
  throw new Error("intentional error");
}
`;

const FN_APP_ERROR = `
class AppError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

export async function POST() {
  throw new AppError(400, "invalid input", "INVALID_INPUT");
}
`;

const FN_SYNTAX_ERROR = `
export async function GET(ctx) {
  return {{ invalid syntax
}
`;

const FN_NO_EXPORTS = `
const helper = () => "not exported";
`;

const FN_MULTI_METHOD = `
export async function GET(ctx) {
  return { method: "GET" };
}
export async function POST(ctx) {
  return { method: "POST" };
}
`;

const FN_CRON_CONTEXT = `
export async function run(ctx) {
  return {
    mode: ctx.mode,
    trigger: ctx.trigger,
    hasRequest: ctx.req !== undefined,
  };
}
`;

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

async function waitFor<T>(
  getValue: () => T,
  predicate: (value: T) => boolean,
  timeoutMs = 250,
): Promise<T> {
  const startedAt = Date.now();

  while (true) {
    const value = getValue();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return value;
    }
    await Bun.sleep(10);
  }
}

// --- Tests ---

describe('Function Runtime (HTTP integration)', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('draft rebuild validates functions', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.data.success).toBe(true);
    expect(body.data.migrations).toContain('001_init.sql');
    expect(body.data.functions.validated).toContain('health');
    expect(body.data.functions.warnings).toHaveLength(0);
  });

  test('draft function GET returns correct response', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));

    // Must rebuild first to create draft DB
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/health');
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.status).toBe('ok');
    expect(body.app).toBe('myapp');
    expect(body.mode).toBe('draft');
  });

  test('publish then stable function returns correct response', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));

    // Rebuild + publish
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    const pubRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
    expect((await jsonBody(pubRes)).data.success).toBe(true);

    // Now call stable function
    const res = await app.request('/stable/apps/myapp/fn/health');
    expect(res.status).toBe(200);

    const body = await jsonBody(res);
    expect(body.status).toBe('ok');
    expect(body.app).toBe('myapp');
    expect(body.mode).toBe('stable');
  });

  test('draft function requires rebuild to pick up DB-only file changes', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    // First call — original version
    const res1 = await app.request('/draft/apps/myapp/fn/health');
    const body1 = await jsonBody(res1);
    expect(body1.version).toBeUndefined();

    // Modify function in DB (source only)
    addFunction(handle, 'myapp', 'health.ts', FN_HEALTH_V2);

    // Second call — draft still sees old code (loads from draft dir, not source)
    const res2 = await app.request('/draft/apps/myapp/fn/health');
    const body2 = await jsonBody(res2);
    expect(body2.version).toBeUndefined();

    // Rebuild to copy the updated DB content into the draft dir
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    // Third call — now sees updated code
    const res3 = await app.request('/draft/apps/myapp/fn/health');
    const body3 = await jsonBody(res3);
    expect(body3.version).toBe(2);
  });

  test('404 for nonexistent function', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/nonexistent');
    expect(res.status).toBe(404);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('405 for unsupported HTTP method', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    // health.ts only exports GET, so POST should be 405
    const res = await app.request('/draft/apps/myapp/fn/health', { method: 'POST' });
    expect(res.status).toBe(405);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  test('500 for function runtime error with stack in draft', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'broken.ts': FN_BROKEN },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/broken');
    expect(res.status).toBe(500);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('FUNCTION_ERROR');
    expect(body.error.message).toBe('intentional error');
    expect(body.error.stack).toBeDefined(); // Stack trace included in draft mode

    const errorLogs = await waitFor(
      () => handle.workspace.getPlatformRepo().appErrorLogs.listByAppAndMode('myapp', 'draft', {
        limit: 10,
        sourceType: 'http_function',
      }),
      (logs) => logs.length === 1,
    );
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]?.error_code).toBe('FUNCTION_ERROR');
    expect(errorLogs[0]?.error_message).toBe('intentional error');
  });

  test('4xx app errors preserve response semantics and do not write app_error_logs', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'submit.ts': FN_APP_ERROR },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/submit', { method: 'POST' });
    expect(res.status).toBe(400);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('INVALID_INPUT');
    expect(body.error.message).toBe('invalid input');

    const errorLogs = handle.workspace.getPlatformRepo().appErrorLogs.listByAppAndMode('myapp', 'draft', {
      limit: 10,
      sourceType: 'http_function',
    });
    expect(errorLogs).toHaveLength(0);
  });

  test('404 for _ prefix function (reserved)', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { '_utils.ts': 'export function helper() { return 1; }' },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/_utils');
    expect(res.status).toBe(404);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  test('rebuild reports warnings for function with no valid exports', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH, 'bad.ts': FN_NO_EXPORTS },
    });

    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    const body = await jsonBody(res);

    expect(body.data.success).toBe(true);
    expect(body.data.functions.validated).toContain('health');
    expect(body.data.functions.warnings).toHaveLength(1);
    expect(body.data.functions.warnings[0].name).toBe('bad');
    expect(body.data.functions.warnings[0].valid).toBe(false);
    expect(body.data.functions.warnings[0].error).toContain('No valid handler export');
  });

  test('multi-method function routes correctly', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'items.ts': FN_MULTI_METHOD },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    // GET
    const getRes = await app.request('/draft/apps/myapp/fn/items');
    expect(getRes.status).toBe(200);
    expect((await jsonBody(getRes)).method).toBe('GET');

    // POST
    const postRes = await app.request('/draft/apps/myapp/fn/items', { method: 'POST' });
    expect(postRes.status).toBe(200);
    expect((await jsonBody(postRes)).method).toBe('POST');

    // DELETE — not exported, no default → 405
    const delRes = await app.request('/draft/apps/myapp/fn/items', { method: 'DELETE' });
    expect(delRes.status).toBe(405);
  });

  test('stable function does not see workspace changes without publish', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));

    // Rebuild + publish v1
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    const pubRes = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
    expect((await jsonBody(pubRes)).data.success).toBe(true);

    // Stable returns v1
    const res1 = await app.request('/stable/apps/myapp/fn/health');
    expect(res1.status).toBe(200);
    const body1 = await jsonBody(res1);
    expect(body1.version).toBeUndefined();

    // Modify function in DB (without publishing)
    addFunction(handle, 'myapp', 'health.ts', FN_HEALTH_V2);

    // Stable still returns v1 (reads from published snapshot, not DB)
    const res2 = await app.request('/stable/apps/myapp/fn/health');
    expect(res2.status).toBe(200);
    const body2 = await jsonBody(res2);
    expect(body2.version).toBeUndefined();

    // Draft sees v2 after rebuild
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    const draftRes = await app.request('/draft/apps/myapp/fn/health');
    expect(draftRes.status).toBe(200);
    const draftBody = await jsonBody(draftRes);
    expect(draftBody.version).toBe(2);
  });

  test('publish refreshes stable function to new code', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app } = createServer(createTestConfig(handle.root));

    // Publish v1
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    await app.request('/draft/apps/myapp/publish', { method: 'POST' });

    // Stable returns v1
    const res1 = await app.request('/stable/apps/myapp/fn/health');
    const body1 = await jsonBody(res1);
    expect(body1.version).toBeUndefined();

    // Update function in DB and publish again
    addFunction(handle, 'myapp', 'health.ts', FN_HEALTH_V2);
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    const pubRes2 = await app.request('/draft/apps/myapp/publish', { method: 'POST' });
    expect((await jsonBody(pubRes2)).data.success).toBe(true);

    // Stable now returns v2
    const res2 = await app.request('/stable/apps/myapp/fn/health');
    expect(res2.status).toBe(200);
    const body2 = await jsonBody(res2);
    expect(body2.version).toBe(2);
  });

  test('schedule execution builds cron context with optional req', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'jobs.ts': FN_CRON_CONTEXT },
    });
    setAppSpec(handle, 'myapp', {
      description: 'test',
      schedules: [
        { name: 'nightly', cron: '*/5 * * * *', function: 'jobs:run' },
      ],
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/schedule/nightly/trigger', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    expect(body.data.status).toBe('success');
    expect(body.data.result).toEqual({
      mode: 'draft',
      trigger: 'cron',
      hasRequest: false,
    });
  });

  test('syntax error in function returns 500 with FUNCTION_LOAD_ERROR', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'bad.ts': FN_SYNTAX_ERROR },
    });

    const { app } = createServer(createTestConfig(handle.root));
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });

    const res = await app.request('/draft/apps/myapp/fn/bad');
    expect(res.status).toBe(500);

    const body = await jsonBody(res);
    expect(body.error.code).toBe('FUNCTION_LOAD_ERROR');

    const errorLogs = await waitFor(
      () => handle.workspace.getPlatformRepo().appErrorLogs.listByAppAndMode('myapp', 'draft', {
        limit: 10,
        sourceType: 'http_function',
      }),
      (logs) => logs.length === 1,
    );
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]?.error_code).toBe('FUNCTION_LOAD_ERROR');
  });

  test('shutdown clears function runtime caches', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'health.ts': FN_HEALTH },
    });

    const { app, registry } = createServer(createTestConfig(handle.root));

    // Rebuild + publish to populate stable cache
    await app.request('/draft/apps/myapp/rebuild', { method: 'POST' });
    await app.request('/draft/apps/myapp/publish', { method: 'POST' });
    await app.request('/stable/apps/myapp/fn/health');

    // shutdown should complete without error
    registry.shutdownAll();

    // After shutdown, registry is empty — app is no longer reachable
    const res = await app.request('/stable/apps/myapp/fn/health');
    expect(res.status).toBe(404);
  });
});

describe('createServer() first-init auto-publish', () => {
  let tmpRoot: string;

  afterEach(() => {
    if (tmpRoot) {
      rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  test('createServer on fresh directory auto-publishes template apps to stable', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cozybase-init-'));

    // createServer triggers workspace.init() + auto-publish on a fresh directory
    const { app, workspace, registry, startup } = createServer({
      port: 0,
      host: '127.0.0.1',
      workspaceDir: tmpRoot,
      jwtSecret: 'test-secret',
    });

    await startup;

    // After createServer, welcome app should be auto-published and running stable
    const state = workspace.getAppState('welcome');
    expect(state).toEqual({ stableStatus: 'running', hasDraft: false });

    // Stable DB should exist
    const stableDbPath = join(tmpRoot, 'stable', 'welcome', 'db.sqlite');
    expect(existsSync(stableDbPath)).toBe(true);

    // Stable function route should work
    const res = await app.request('/stable/apps/welcome/fn/todos');
    expect(res.status).toBe(200);

    registry.shutdownAll();
    workspace.close();
  });

  test('createServer on existing workspace does not auto-publish', async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'cozybase-init-'));

    // First boot — triggers init + auto-publish
    const { workspace: ws1, registry: reg1, startup: s1 } = createServer({
      port: 0,
      host: '127.0.0.1',
      workspaceDir: tmpRoot,
      jwtSecret: 'test-secret',
    });
    await s1;
    expect(ws1.getAppState('welcome')).toEqual({ stableStatus: 'running', hasDraft: false });
    reg1.shutdownAll();
    ws1.close();

    // Increment current_version in platform DB to simulate a new draft change
    const platformDbPath = join(tmpRoot, 'platform.sqlite');
    const db = new Database(platformDbPath);
    db.query("UPDATE apps SET current_version = current_version + 1 WHERE slug = 'welcome'").run();
    db.close();

    // Second boot — should NOT auto-publish (workspace already initialized)
    const { workspace: ws2, registry: reg2, startup: s2 } = createServer({
      port: 0,
      host: '127.0.0.1',
      workspaceDir: tmpRoot,
      jwtSecret: 'test-secret',
    });
    await s2;

    // State should retain stable and show draft changes - auto-publish did NOT run
    const state = ws2.getAppState('welcome');
    expect(state).toEqual({ stableStatus: 'running', hasDraft: true });
    expect(reg2.get('welcome', 'draft')).toBeUndefined();

    reg2.shutdownAll();
    ws2.close();
  });
});

describe('createServer() draft runtime startup for materialized draft state', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('does not auto-restore prepared draft runtime when hasDraft is false', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      ui: JSON.stringify({ pages: [] }),
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
    handle.workspace.refreshAppState('myapp');
    expect(handle.workspace.getAppState('myapp')).toEqual({
      stableStatus: 'running',
      hasDraft: false,
    });

    const appContext = handle.workspace.getOrCreateApp('myapp')!;
    appContext.draftDb.exec('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, executed_at TEXT NOT NULL DEFAULT (datetime(\'now\')))');
    appContext.close();

    mkdirSync(join(handle.root, 'draft', 'myapp', 'ui'), { recursive: true });
    writeFileSync(
      join(handle.root, 'draft', 'myapp', 'ui', 'pages.json'),
      JSON.stringify({ pages: [] }),
      'utf-8',
    );
    writeFileSync(
      join(handle.root, 'draft', 'myapp', '.rebuild-state.json'),
      JSON.stringify({ migrationSignature: 'test-signature' }),
      'utf-8',
    );

    const { app, registry, startup } = createServer(createTestConfig(handle.root));
    await startup;

    // Draft runtime is NOT started eagerly at startup for stable-only apps
    expect(registry.get('myapp', 'draft')).toBeUndefined();
    // But auto-prepare middleware prepares it on-demand when a draft route is accessed
    const uiRes = await app.request('/draft/apps/myapp/ui');
    expect(uiRes.status).toBe(200);

    registry.shutdownAll();
  });

  test('does not start draft runtime when rebuild-state is missing for hasDraft false app', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
    handle.workspace.refreshAppState('myapp');
    expect(handle.workspace.getAppState('myapp')).toEqual({
      stableStatus: 'running',
      hasDraft: false,
    });

    const { app, registry, startup } = createServer(createTestConfig(handle.root));
    await startup;

    // Draft runtime is NOT started eagerly at startup
    expect(registry.get('myapp', 'draft')).toBeUndefined();
    // Auto-prepare triggers on-demand but UI still returns 404 because this app has no ui/pages.json
    const uiRes = await app.request('/draft/apps/myapp/ui');
    expect(uiRes.status).toBe(404);

    registry.shutdownAll();
  });
});
