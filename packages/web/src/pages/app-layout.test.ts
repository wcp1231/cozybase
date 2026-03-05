import { describe, expect, test } from 'bun:test';
import { loadAppLayoutData } from './app-layout';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('loadAppLayoutData', () => {
  test('auto prepares stable-only draft app before loading draft UI', async () => {
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
      if (url === '/draft/apps/orders/prepare') {
        return jsonResponse({ data: { success: true } });
      }
      if (url === '/draft/apps/orders/ui') {
        return jsonResponse({
          data: {
            pages: [{ id: 'home', title: 'Home', body: [] }],
          },
        });
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    const result = await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/prepare', method: 'POST' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
    expect(result.app.slug).toBe('orders');
    expect(result.pagesJson).toEqual({
      pages: [{ id: 'home', title: 'Home', body: [] }],
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

  test('fallback prepares and retries UI when draft UI returns 404 first', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    let uiCallCount = 0;
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
        uiCallCount += 1;
        if (uiCallCount === 1) {
          return jsonResponse({ error: { code: 'NOT_FOUND' } }, 404);
        }
        return jsonResponse({ data: { pages: [{ id: 'home', title: 'Home', body: [] }] } });
      }
      if (url === '/draft/apps/orders/prepare') {
        return jsonResponse({ data: { success: true } });
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    const result = await loadAppLayoutData('orders', 'draft', fetchMock);

    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
      { url: '/draft/apps/orders/prepare', method: 'POST' },
      { url: '/draft/apps/orders/ui', method: 'GET' },
    ]);
    expect(result.pagesJson).toEqual({
      pages: [{ id: 'home', title: 'Home', body: [] }],
    });
  });

  test('throws explicit error when auto prepare fails', async () => {
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
      if (url === '/draft/apps/orders/prepare') {
        return jsonResponse({ error: { code: 'INTERNAL_ERROR' } }, 500);
      }
      throw new Error(`Unexpected fetch request: ${method} ${url}`);
    };

    await expect(loadAppLayoutData('orders', 'draft', fetchMock)).rejects.toThrow(
      'Failed to prepare draft: HTTP 500',
    );
    expect(calls).toEqual([
      { url: '/api/v1/apps/orders', method: 'GET' },
      { url: '/draft/apps/orders/prepare', method: 'POST' },
    ]);
  });
});
