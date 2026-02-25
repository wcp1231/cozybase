import { createMiddleware } from 'hono/factory';
import type { Workspace } from '../core/workspace';
import type { AppContext } from '../core/app-context';
import { NotFoundError } from '../core/errors';

export type AppEnv = {
  Variables: {
    appContext: AppContext;
  };
};

/** Extract appName from URL params, resolve AppContext, and inject into context */
export function appResolver(workspace: Workspace) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const appName = c.req.param('appName');
    if (!appName) {
      throw new NotFoundError('App name is required');
    }

    const appContext = workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new NotFoundError(`App '${appName}' not found in workspace`);
    }

    c.set('appContext', appContext);
    await next();
  });
}
