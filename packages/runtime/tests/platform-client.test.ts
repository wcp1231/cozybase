import { describe, test, expect } from 'bun:test';
import { Hono } from 'hono';
import {
  createInProcessPlatformClient,
  PLATFORM_CALL_DEPTH_HEADER,
  type PlatformHandler,
} from '../src/platform-client';

describe('PlatformClient', () => {
  test('routes APP target calls through runtime app', async () => {
    const runtimeApp = new Hono();
    runtimeApp.get('/stable/apps/todos/fn/stats', (c) => {
      return c.json({
        ok: true,
        depth: c.req.header(PLATFORM_CALL_DEPTH_HEADER),
      });
    });

    const platformHandler: PlatformHandler = {
      async handle() {
        return new Response('unexpected platform call', { status: 500 });
      },
    };
    const client = createInProcessPlatformClient(runtimeApp, platformHandler, 'stable');

    const response = await client.call('todos', 'stats');
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; depth: string };
    expect(body.ok).toBe(true);
    expect(body.depth).toBe('1');
  });

  test('routes _platform calls through PlatformHandler', async () => {
    const runtimeApp = new Hono();
    let handledPath = '';
    let handledDepth = '';

    const platformHandler: PlatformHandler = {
      async handle(path, request) {
        handledPath = path;
        handledDepth = request.headers.get(PLATFORM_CALL_DEPTH_HEADER) ?? '';
        return new Response('ok');
      },
    };
    const client = createInProcessPlatformClient(runtimeApp, platformHandler, 'stable');

    const response = await client.call('_platform', 'theme/css');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('ok');
    expect(handledPath).toBe('theme/css');
    expect(handledDepth).toBe('1');
  });

  test('returns 508 when call depth exceeds limit', async () => {
    const runtimeApp = new Hono();
    const platformHandler: PlatformHandler = {
      async handle() {
        return new Response('ok');
      },
    };
    const client = createInProcessPlatformClient(runtimeApp, platformHandler, 'stable');

    const response = await client.call('todos', 'stats', {
      headers: { [PLATFORM_CALL_DEPTH_HEADER]: '10' },
    });

    expect(response.status).toBe(508);
    const body = await response.json() as { error: { code: string } };
    expect(body.error.code).toBe('LOOP_DETECTED');
  });
});
