import { describe, test, expect, afterEach } from 'bun:test';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestWorkspace,
  createTestApp,
  MIGRATION_CREATE_TODOS,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';

const FN_PING = `
export async function GET(ctx) {
  return { app: ctx.app.name, mode: ctx.mode };
}
`;

const FN_CALL_PEER = `
export async function GET(ctx) {
  const res = await ctx.platform.call('peer', 'ping');
  const data = await res.json();
  return { status: res.status, data };
}
`;

const FN_PLATFORM_THEME = `
export async function GET(ctx) {
  const res = await ctx.platform.call('_platform', 'theme/css');
  const css = await res.text();
  return { status: res.status, cssLength: css.length };
}
`;

const FN_RECURSE = `
export async function GET(ctx) {
  return ctx.platform.call('loop', 'recurse');
}
`;

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

describe('PlatformClient integration', () => {
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

  test('app function can call another app function via ctx.platform.call()', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'caller', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'call-peer.ts': FN_CALL_PEER },
    });
    createTestApp(handle, 'peer', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'ping.ts': FN_PING },
    });

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(handle.root));
    registry = runtimeRegistry;
    await startup;
    await app.request('/draft/apps/caller/rebuild', { method: 'POST' });
    await app.request('/draft/apps/peer/rebuild', { method: 'POST' });

    const res = await app.request('http://localhost/draft/apps/caller/fn/call-peer');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: number; data: { app: string } };
    expect(body.status).toBe(200);
    expect(body.data.app).toBe('peer');
  });

  test('ctx.platform.call() can route to _platform namespace', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'caller', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'theme.ts': FN_PLATFORM_THEME },
    });

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(handle.root));
    registry = runtimeRegistry;
    await startup;
    await app.request('/draft/apps/caller/rebuild', { method: 'POST' });

    const res = await app.request('http://localhost/draft/apps/caller/fn/theme');
    expect(res.status).toBe(200);
    const body = await res.json() as { status: number; cssLength: number };
    expect(body.status).toBe(200);
    expect(body.cssLength).toBeGreaterThan(0);
  });

  test('looped platform calls are rejected with 508', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'loop', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'recurse.ts': FN_RECURSE },
    });

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(handle.root));
    registry = runtimeRegistry;
    await startup;
    await app.request('/draft/apps/loop/rebuild', { method: 'POST' });

    const res = await app.request('http://localhost/draft/apps/loop/fn/recurse');
    expect(res.status).toBe(508);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOOP_DETECTED');
  });
});
