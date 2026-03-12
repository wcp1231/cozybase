import { createMiddleware } from 'hono/factory';
import { daemonLogger } from '../core/daemon-logger';

export function logger() {
  return createMiddleware(async (c, next) => {
    const start = performance.now();
    await next();
    const ms = (performance.now() - start).toFixed(1);
    const status = c.res.status;
    const method = c.req.method;
    const path = c.req.path;
    daemonLogger.debug(`${method} ${path} ${status} ${ms}ms`);
  });
}
