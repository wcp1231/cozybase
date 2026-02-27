import { Hono } from 'hono';
import { AppRegistry } from './registry';
import { appEntryResolver } from './middleware/app-entry-resolver';
import { createFunctionRoutes } from './modules/functions/routes';
import { createDbRoutes } from './modules/db/routes';
import { createUiRoutes } from './modules/ui/routes';

export { AppRegistry, type AppEntry, type AppStartRequest, type AppMode, type AppStatus } from './registry';
export { type DaemonClient, createInProcessDaemonClient, createHttpDaemonClient } from './daemon-client';
export { HTTP_METHODS, type HttpMethod } from './modules/functions/types';

export interface RuntimeOptions {
  // Reserved for future options (e.g., daemon client for auth delegation)
}

/**
 * Create a Runtime Hono app instance with all APP routes.
 *
 * Returns { app, registry } where:
 * - `app` is the Hono app with stable/draft routes (mount at root via `app.route('/', runtimeApp)`)
 * - `registry` is the AppRegistry for direct lifecycle management (start/stop/restart/shutdownAll)
 *
 * NOTE: Internal management is done via registry directly — no /internal routes are exposed on the app.
 */
export function createRuntime(options?: RuntimeOptions) {
  const app = new Hono();
  const registry = new AppRegistry();

  // --- APP external routes ---
  // These routes expect to be mounted under /{mode} prefix by Daemon,
  // so the mode is determined by the mount point.

  // Stable mode routes
  const stableFn = new Hono();
  stableFn.use('*', appEntryResolver(registry, 'stable'));
  stableFn.route('/', createFunctionRoutes());

  const stableDb = new Hono();
  stableDb.use('*', appEntryResolver(registry, 'stable'));
  stableDb.route('/', createDbRoutes());

  const stableUi = new Hono();
  stableUi.use('*', appEntryResolver(registry, 'stable'));
  stableUi.route('/', createUiRoutes());

  // Draft mode routes
  const draftFn = new Hono();
  draftFn.use('*', appEntryResolver(registry, 'draft'));
  draftFn.route('/', createFunctionRoutes());

  const draftDb = new Hono();
  draftDb.use('*', appEntryResolver(registry, 'draft'));
  draftDb.route('/', createDbRoutes());

  const draftUi = new Hono();
  draftUi.use('*', appEntryResolver(registry, 'draft'));
  draftUi.route('/', createUiRoutes());

  // Mount stable routes
  app.route('/stable/apps/:name/fn', stableFn);
  app.route('/stable/apps/:name/db', stableDb);
  app.route('/stable/apps/:name', stableUi);

  // Mount draft routes
  app.route('/draft/apps/:name/fn', draftFn);
  app.route('/draft/apps/:name/db', draftDb);
  app.route('/draft/apps/:name', draftUi);

  return { app, registry };
}
