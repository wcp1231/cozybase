import { Hono } from 'hono';
import type { PlatformClient } from '../../platform-client';
import type { RuntimeAppEnv } from '../../middleware/app-entry-resolver';
import type { ErrorRecorder } from './types';
import { createDbRoutes } from '../db/routes';
import { executeFunction } from './executor';

export function createFunctionRoutes(platformClient: PlatformClient, errorRecorder?: ErrorRecorder) {
  const app = new Hono<RuntimeAppEnv>();

  app.route('/_db', createDbRoutes());

  app.all('/:fnName', async (c) => {
    const entry = c.get('appEntry');
    const fnName = c.req.param('fnName')!;
    return executeFunction(entry, fnName, c.req.raw, platformClient, errorRecorder);
  });

  return app;
}
