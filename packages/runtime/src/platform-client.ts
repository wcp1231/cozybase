import type { Hono } from 'hono';
import type { AppMode } from './registry';

export interface PlatformClient {
  call(target: string, path: string, options?: RequestInit): Promise<Response>;
}

export interface PlatformHandler {
  handle(path: string, request: Request): Promise<Response>;
}

export const PLATFORM_CALL_DEPTH_HEADER = 'X-Platform-Call-Depth';
const MAX_PLATFORM_CALL_DEPTH = 10;

export function createInProcessPlatformClient(
  runtimeApp: Hono,
  platformHandler: PlatformHandler | undefined,
  mode: AppMode,
): PlatformClient {
  return {
    async call(target: string, path: string, options?: RequestInit): Promise<Response> {
      const headers = new Headers(options?.headers);
      const currentDepth = parseDepth(headers.get(PLATFORM_CALL_DEPTH_HEADER));
      const nextDepth = currentDepth + 1;

      if (nextDepth > MAX_PLATFORM_CALL_DEPTH) {
        return jsonError(508, 'LOOP_DETECTED', `Platform call depth exceeded limit (${MAX_PLATFORM_CALL_DEPTH})`);
      }

      headers.set(PLATFORM_CALL_DEPTH_HEADER, String(nextDepth));
      const method = options?.method ?? 'GET';

      const normalizedPath = normalizePath(path);
      if (target === '_platform') {
        if (!platformHandler) {
          return jsonError(501, 'NOT_IMPLEMENTED', 'Platform handler is not configured');
        }
        const request = new Request(buildUrl('/_platform', normalizedPath), {
          ...options,
          method,
          headers,
        });
        return platformHandler.handle(normalizedPath, request);
      }

      const runtimePath = `/${mode}/apps/${encodeURIComponent(target)}/fn${normalizedPath ? `/${normalizedPath}` : ''}`;
      return runtimeApp.request(buildUrl('', runtimePath), {
        ...options,
        method,
        headers,
      });
    },
  };
}

function parseDepth(value: string | null): number {
  if (!value) return 0;
  const depth = Number.parseInt(value, 10);
  return Number.isFinite(depth) && depth > 0 ? depth : 0;
}

function normalizePath(path: string): string {
  return path.replace(/^\/+/, '');
}

function buildUrl(prefix: string, path: string): string {
  const normalizedPrefix = prefix.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');
  if (!normalizedPrefix) {
    return `http://localhost/${normalizedPath}`;
  }
  return `http://localhost${normalizedPrefix}/${normalizedPath}`;
}

function jsonError(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
