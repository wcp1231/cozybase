import { Hono } from 'hono';
import type { AppEnv } from '../../middleware/app-resolver';
import type { FunctionRuntime } from './types';

export function createFunctionRoutes(runtime: FunctionRuntime) {
  const app = new Hono<AppEnv>();

  app.all('/:name', async (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const name = c.req.param('name')!;

    const response = await runtime.execute(appContext, name, c.req.raw, mode);
    return response;
  });

  return app;
}
