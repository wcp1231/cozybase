import { createMiddleware } from 'hono/factory';
import type { Workspace } from '../core/workspace';
import type { AppContext } from '../core/app-context';
import { NotFoundError } from '../core/errors';

export type AppMode = 'stable' | 'draft';

export type AppEnv = {
  Variables: {
    appContext: AppContext;
    appMode: AppMode;
  };
};

/** Extract appName from URL params, resolve AppContext, validate mode, and inject into context */
export function appResolver(workspace: Workspace, mode: AppMode) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const appName = c.req.param('appName');
    if (!appName) {
      throw new NotFoundError('App name is required');
    }

    // Refresh state from filesystem/git before checking
    workspace.refreshAppState(appName);
    const state = workspace.getAppState(appName);
    if (!state) {
      throw new NotFoundError(`App '${appName}' not found`);
    }

    if (mode === 'stable' && state.stableStatus === null) {
      throw new NotFoundError(`App '${appName}' has no stable version yet`);
    }

    if (mode === 'draft' && !state.hasDraft) {
      throw new NotFoundError(`App '${appName}' has no draft changes`);
    }

    const appContext = workspace.getOrCreateApp(appName);
    if (!appContext) {
      throw new NotFoundError(`App '${appName}' not found in workspace`);
    }

    c.set('appContext', appContext);
    c.set('appMode', mode);
    await next();
  });
}
