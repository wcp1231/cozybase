import { createMiddleware } from 'hono/factory';
import { verifyToken, verifyApiKey, type JwtPayload } from '../core/auth';
import { UnauthorizedError } from '../core/errors';
import type { Config } from '../config';
import type { Workspace } from '../core/workspace';

export type AuthEnv = {
  Variables: {
    auth: JwtPayload | { role: string; appName: string; type: 'apikey' };
  };
};

/** Authenticate via Bearer JWT or X-API-Key header */
export function authMiddleware(config: Config, workspace: Workspace) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    // Try API key first
    const apiKey = c.req.header('X-API-Key') ?? c.req.header('apikey');
    if (apiKey) {
      const result = verifyApiKey(apiKey, workspace.getPlatformRepo());
      if (!result) {
        throw new UnauthorizedError('Invalid API key');
      }
      c.set('auth', { ...result, type: 'apikey' as const });
      return next();
    }

    // Try Bearer token
    const authHeader = c.req.header('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = await verifyToken(token, config);
        c.set('auth', payload);
        return next();
      } catch {
        throw new UnauthorizedError('Invalid token');
      }
    }

    throw new UnauthorizedError('Missing authentication');
  });
}

/** Optional auth - doesn't throw if no credentials provided */
export function optionalAuth(config: Config, workspace: Workspace) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const apiKey = c.req.header('X-API-Key') ?? c.req.header('apikey');
    if (apiKey) {
      const result = verifyApiKey(apiKey, workspace.getPlatformRepo());
      if (result) {
        c.set('auth', { ...result, type: 'apikey' as const });
      }
    } else {
      const authHeader = c.req.header('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        try {
          const payload = await verifyToken(token, config);
          c.set('auth', payload);
        } catch {
          // ignore invalid token in optional mode
        }
      }
    }
    return next();
  });
}
