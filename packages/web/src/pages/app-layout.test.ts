import { describe, expect, test } from 'bun:test';
import { loadAppLayoutData, resolveChatTarget } from './app-layout';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('loadAppLayoutData', () => {
  test('loads draft UI without calling a dedicated prepare endpoint', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === '/api/v1/apps/orders') {
        return jsonResponse({
          data: {
            slug: 'orders',
            displayName: 'Orders',
            description: 'Orders app',
            stableStatus: 'running',
            hasDraft: false,
            current_version: 1,
            published_version: 1,
          },
        });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse({
          data: {
            pages: [{ path: 'home', title: 'Home', body: [] }],
          },
        });
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    const result = await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
    expect(result.app.slug).toBe('orders');
    expect(result.pagesJson).toEqual({
      pages: [{ path: 'home', title: 'Home', body: [] }],
    });
  });

  test('does not auto prepare when app already has draft changes', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === '/api/v1/apps/orders') {
        return jsonResponse({
          data: {
            slug: 'orders',
            displayName: 'Orders',
            description: 'Orders app',
            stableStatus: 'running',
            hasDraft: true,
            current_version: 2,
            published_version: 1,
          },
        });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse({ data: { pages: [] } });
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
  });

  test('returns null UI when draft UI returns 404', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === '/api/v1/apps/orders') {
        return jsonResponse({
          data: {
            slug: 'orders',
            displayName: 'Orders',
            description: 'Orders app',
            stableStatus: 'running',
            hasDraft: true,
            current_version: 2,
            published_version: 1,
          },
        });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404);
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    const result = await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
    expect(result.pagesJson).toBeNull();
  });

  test('returns null UI when draft UI is missing without auto-prepare', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === '/api/v1/apps/orders') {
        return jsonResponse({
          data: {
            slug: 'orders',
            displayName: 'Orders',
            description: 'Orders app',
            stableStatus: 'running',
            hasDraft: false,
            current_version: 1,
            published_version: 1,
          },
        });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404);
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    const result = await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
    expect(result.pagesJson).toBeNull();
  });

  test('throws explicit error when backend auto-prepare fails', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ url, method });

      if (url === '/api/v1/apps/orders') {
        return jsonResponse({
          data: {
            slug: 'orders',
            displayName: 'Orders',
            description: 'Orders app',
            stableStatus: 'running',
            hasDraft: false,
            current_version: 1,
            published_version: 1,
          },
        });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse(
          { error: { code: 'DRAFT_PREPARE_FAILED', message: 'Migration failed (001_init.sql): syntax error' } },
          500,
        );
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    await expect(loadAppLayoutData('orders', 'draft', fetchMock)).rejects.toThrow(
      'Failed to load UI: Migration failed (001_init.sql): syntax error',
    );
    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
  });
});

describe('resolveChatTarget', () => {
  test('uses operator chat on stable app pages', () => {
    expect(resolveChatTarget('/stable/apps/orders/home', 'stable', 'orders')).toEqual({
      kind: 'operator',
      appName: 'orders',
    });
  });

  test('uses builder chat on draft app pages', () => {
    expect(resolveChatTarget('/draft/apps/orders/home', 'draft', 'orders')).toEqual({
      kind: 'builder',
      appName: 'orders',
    });
  });

  test('does not show chat on non-app and console routes', () => {
    expect(resolveChatTarget('/stable', 'stable', undefined)).toBeNull();
    expect(resolveChatTarget('/stable/apps', 'stable', undefined)).toBeNull();
    expect(resolveChatTarget('/stable/settings', 'stable', undefined)).toBeNull();
    expect(resolveChatTarget('/stable/apps/orders/console', 'stable', 'orders')).toBeNull();
  });
});
