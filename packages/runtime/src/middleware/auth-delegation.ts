import { createMiddleware } from 'hono/factory';
import type { PlatformClient } from '../platform-client';

export type AuthEnv = {
  Variables: {
    user: { id: string; name: string; role: string } | null;
  };
};

interface AuthVerifyResult {
  authenticated: boolean;
  user?: { id: string; name: string; role: string };
  error?: string;
}

/**
 * Middleware that delegates authentication via PlatformClient.
 * Extracts Authorization header and calls _platform/auth/verify.
 * Returns 401 if authentication fails.
 */
export function authDelegation(platformClient: PlatformClient) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing authentication' } }, 401);
    }

    const response = await platformClient.call('_platform', 'auth/verify', {
      method: 'POST',
      headers: { Authorization: authHeader },
    });
    if (!response.ok) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication failed' } }, 401);
    }

    const result = await response.json() as AuthVerifyResult;
    if (!result.authenticated) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: result.error ?? 'Authentication failed' } }, 401);
    }

    c.set('user', result.user ?? null);
    await next();
  });
}
