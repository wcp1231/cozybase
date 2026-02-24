import { createMiddleware } from 'hono/factory';
import { existsSync } from 'fs';
import { join } from 'path';
import type { Config } from '../config';
import { NotFoundError } from '../core/errors';

export type AppEnv = {
  Variables: {
    appName: string;
  };
};

/** Extract appName from URL params and verify the app exists in workspace */
export function appResolver(config: Config) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const appName = c.req.param('appName');
    if (!appName) {
      throw new NotFoundError('App name is required');
    }

    // Verify app exists in workspace (has app.yaml)
    const appYaml = join(config.workspaceDir, appName, 'app.yaml');
    if (!existsSync(appYaml)) {
      throw new NotFoundError(`App '${appName}' not found in workspace`);
    }

    c.set('appName', appName);
    await next();
  });
}
