import { Hono } from 'hono';
import type { RuntimeAppEnv } from '../../middleware/app-entry-resolver';
import { executeFunction } from './executor';

export function createFunctionRoutes() {
  const app = new Hono<RuntimeAppEnv>();

  app.all('/:fnName', async (c) => {
    const entry = c.get('appEntry');
    const fnName = c.req.param('fnName')!;
    return executeFunction(entry, fnName, c.req.raw);
  });

  return app;
}
