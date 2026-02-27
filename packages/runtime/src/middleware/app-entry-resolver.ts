import { createMiddleware } from 'hono/factory';
import type { AppRegistry, AppEntry, AppMode } from '../registry';

export type RuntimeAppEnv = {
  Variables: {
    appEntry: AppEntry;
    appMode: AppMode;
  };
};

/**
 * Middleware that resolves an APP entry from the registry.
 * Extracts :name from URL params, and mode is passed as a parameter.
 * Returns 404 if not found, 503 if stopped.
 */
export function appEntryResolver(registry: AppRegistry, mode: AppMode) {
  return createMiddleware<RuntimeAppEnv>(async (c, next) => {
    const name = c.req.param('name');
    if (!name) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'App name is required' } }, 400);
    }

    const entry = registry.get(name, mode);
    if (!entry) {
      return c.json({ error: { code: 'NOT_FOUND', message: `App '${name}:${mode}' not found` } }, 404);
    }

    if (entry.status === 'stopped') {
      return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: `App '${name}:${mode}' is stopped` } }, 503);
    }

    c.set('appEntry', entry);
    c.set('appMode', mode);
    await next();
  });
}
