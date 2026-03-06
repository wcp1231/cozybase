import { Hono } from 'hono';
import { AppRegistry } from './registry';
import { appEntryResolver } from './middleware/app-entry-resolver';
import { createFunctionRoutes } from './modules/functions/routes';
import { createUiRoutes } from './modules/ui/routes';
import {
  createInProcessPlatformClient,
  type PlatformClient,
  type PlatformHandler,
} from './platform-client';

export { AppRegistry, type AppEntry, type AppStartRequest, type AppMode, type AppStatus } from './registry';
export { type PlatformClient, type PlatformHandler, createInProcessPlatformClient } from './platform-client';
export { HTTP_METHODS, type ErrorRecorder, type ErrorRecordEntry, type HttpMethod } from './modules/functions/types';
export {
  executeFunctionReference,
  toFunctionResponse,
  type FunctionReference,
  type ExecuteFunctionReferenceOptions,
} from './modules/functions/executor';
export { validateSql, type SqlMode, type SqlValidationResult } from './modules/db/sql-safety';

export interface RuntimeOptions {
  platformHandler?: PlatformHandler;
  errorRecorder?: import('./modules/functions/types').ErrorRecorder;
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
export function createRuntime(options: RuntimeOptions = {}): {
  app: Hono;
  registry: AppRegistry;
  platformClient: PlatformClient;
  stablePlatformClient: PlatformClient;
  draftPlatformClient: PlatformClient;
} {
  const app = new Hono();
  const registry = new AppRegistry();
  const stablePlatformClient = createInProcessPlatformClient(
    app,
    options.platformHandler,
    'stable',
  );
  const draftPlatformClient = createInProcessPlatformClient(
    app,
    options.platformHandler,
    'draft',
  );

  // --- APP external routes ---
  // These routes expect to be mounted under /{mode} prefix by Daemon,
  // so the mode is determined by the mount point.

  // Stable mode routes
  const stableFn = new Hono();
  stableFn.use('*', appEntryResolver(registry, 'stable'));
  stableFn.route('/', createFunctionRoutes(stablePlatformClient, options.errorRecorder));

  const stableUi = new Hono();
  stableUi.use('*', appEntryResolver(registry, 'stable'));
  stableUi.route('/', createUiRoutes());

  // Draft mode routes
  const draftFn = new Hono();
  draftFn.use('*', appEntryResolver(registry, 'draft'));
  draftFn.route('/', createFunctionRoutes(draftPlatformClient, options.errorRecorder));

  const draftUi = new Hono();
  draftUi.use('*', appEntryResolver(registry, 'draft'));
  draftUi.route('/', createUiRoutes());

  // Mount stable routes
  app.route('/stable/apps/:name/fn', stableFn);
  app.route('/stable/apps/:name', stableUi);

  // Mount draft routes
  app.route('/draft/apps/:name/fn', draftFn);
  app.route('/draft/apps/:name', draftUi);

  return {
    app,
    registry,
    platformClient: stablePlatformClient,
    stablePlatformClient,
    draftPlatformClient,
  };
}
