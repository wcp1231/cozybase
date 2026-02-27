import { createMiddleware } from 'hono/factory';
import type { DaemonClient } from '../daemon-client';

export type AuthEnv = {
  Variables: {
    user: { id: string; name: string; role: string } | null;
  };
};

/**
 * Middleware that delegates authentication to the Daemon.
 * Extracts Authorization header and calls Daemon's /internal/auth/verify.
 * Returns 401 if authentication fails.
 */
export function authDelegation(daemonClient: DaemonClient) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Missing authentication' } }, 401);
    }

    const result = await daemonClient.verifyAuth(authHeader);
    if (!result.authenticated) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: result.error ?? 'Authentication failed' } }, 401);
    }

    c.set('user', result.user ?? null);
    await next();
  });
}
