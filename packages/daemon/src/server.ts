import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { existsSync } from 'fs';
import { resolve, join } from 'path';
import type { Config } from './config';
import { Workspace } from './core/workspace';
import { DraftReconciler } from './core/draft-reconciler';
import { Verifier } from './core/verifier';
import { Publisher } from './core/publisher';
import { AppError, BadRequestError } from './core/errors';
import { logger } from './middleware/logger';
import { createAppRoutes } from './modules/apps/routes';
import { createRuntime, type AppRegistry, type AppStartRequest } from '@cozybase/runtime';

export function createServer(config: Config) {
  const app = new Hono();

  // --- Initialize workspace ---
  const workspace = new Workspace(config.workspaceDir);

  let justInitialized = false;
  if (!workspace.isInitialized()) {
    console.log('Initializing new workspace...');
    workspace.init();
    console.log(`  Workspace created at ${workspace.root}`);
    justInitialized = true;
  }

  workspace.load();

  // --- Core services ---
  const draftReconciler = new DraftReconciler(workspace);
  const verifier = new Verifier(workspace);
  const publisher = new Publisher(workspace);

  // --- Create Runtime ---
  const { app: runtimeApp, registry } = createRuntime();

  // --- Auto-publish template apps after first init ---
  if (justInitialized) {
    for (const appDef of workspace.scanApps()) {
      const state = workspace.getAppState(appDef.name);
      if (state === 'draft_only') {
        console.log(`  Auto-publishing template app: ${appDef.name}`);
        const result = publisher.publish(appDef.name);
        if (!result.success) {
          console.error(`  Failed to auto-publish '${appDef.name}': ${result.error}`);
        }
      }
    }
  }

  // --- Startup promise: load all apps into registry before serving ---
  const startup = startAppsInRuntime(workspace, registry);

  // --- Global middleware ---
  app.use('*', cors());
  app.use('*', logger());

  // --- Error handler ---
  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(
        { error: { code: err.code, message: err.message } },
        err.statusCode as any,
      );
    }
    console.error('Unhandled error:', err);
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      500,
    );
  });

  // --- Health check ---
  app.get('/health', (c) => c.json({ status: 'ok', version: '0.1.0' }));

  // --- Platform API (app listing / status) ---
  app.route('/api/v1', createAppRoutes(workspace, registry));

  // --- Draft management routes: /draft/apps/:appName/(reconcile|verify|publish) ---
  // These MUST be registered BEFORE the runtime catch-all at /draft/apps/:name
  // to prevent the runtime's appEntryResolver from hijacking management requests.

  const draftMgmtMiddleware = async (c: any, next: any) => {
    const appName = c.req.param('appName');
    if (!appName) {
      throw new BadRequestError('App name is required');
    }
    workspace.refreshAppState(appName);
    const state = workspace.getAppState(appName);
    if (!state) {
      throw new BadRequestError(`App '${appName}' not found`);
    }
    if (state === 'deleted') {
      throw new BadRequestError(`App '${appName}' is deleted`);
    }
    await next();
  };

  app.post('/draft/apps/:appName/reconcile', draftMgmtMiddleware, async (c) => {
    const appName = c.req.param('appName')!;
    const result = await draftReconciler.reconcile(appName);

    // Restart draft in Runtime after reconcile
    const appContext = workspace.getOrCreateApp(appName);
    if (appContext) {
      registry.restart(appName, {
        mode: 'draft',
        dbPath: appContext.draftDbPath,
        functionsDir: join(appContext.draftDataDir, 'functions'),
        uiDir: join(appContext.draftDataDir, 'ui'),
      });
    }

    return c.json({ data: result });
  });

  app.post('/draft/apps/:appName/verify', draftMgmtMiddleware, (c) => {
    const appName = c.req.param('appName')!;
    const result = verifier.verify(appName);
    return c.json({ data: result });
  });

  app.post('/draft/apps/:appName/publish', draftMgmtMiddleware, async (c) => {
    const appName = c.req.param('appName')!;
    const result = publisher.publish(appName);

    if (result.success) {
      // Restart stable in Runtime after publish
      const appContext = workspace.getOrCreateApp(appName);
      if (appContext) {
        registry.restart(appName, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });

        // Stop draft version if it was running
        try {
          registry.stop(appName, 'draft');
        } catch {
          // ignore if draft wasn't running
        }
      }
    }

    return c.json({ data: result });
  });

  // --- Mount Runtime routes (stable + draft only, NO /internal) ---
  app.route('/', runtimeApp);

  // --- Internal auth verify endpoint (for Runtime to call back) ---
  app.post('/internal/auth/verify', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader) {
      return c.json({ authenticated: false, error: 'Missing authorization header' });
    }

    // TODO: Integrate with actual auth system
    // For now, delegate to existing auth mechanisms
    return c.json({ authenticated: true, user: { id: 'system', name: 'System', role: 'admin' } });
  });

  // --- Admin SPA static files ---
  const adminDistDir = resolve(import.meta.dir, '..', '..', '..', 'admin', 'dist');

  if (existsSync(adminDistDir)) {
    app.use('/assets/*', serveStatic({ root: adminDistDir }));
    app.use('/favicon.ico', serveStatic({ root: adminDistDir }));
    app.get('*', serveStatic({ root: adminDistDir, path: '/index.html' }));
  }

  return { app, workspace, registry, draftReconciler, verifier, publisher, startup };
}

/**
 * Start all known apps in the Runtime registry directly.
 */
async function startAppsInRuntime(workspace: Workspace, registry: AppRegistry) {
  for (const appDef of workspace.scanApps()) {
    const state = workspace.getAppState(appDef.name);
    const appContext = workspace.getOrCreateApp(appDef.name);
    if (!appContext) continue;

    // Start stable version if published
    if (state === 'stable' || state === 'stable_draft') {
      try {
        registry.start(appDef.name, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
        console.log(`  Started app: ${appDef.name}:stable`);
      } catch (err) {
        console.error(`  Failed to start ${appDef.name}:stable:`, err);
      }
    }

    // Start draft version if has draft changes
    if (state === 'draft_only' || state === 'stable_draft') {
      try {
        registry.start(appDef.name, {
          mode: 'draft',
          dbPath: appContext.draftDbPath,
          functionsDir: join(appContext.draftDataDir, 'functions'),
          uiDir: join(appContext.draftDataDir, 'ui'),
        });
        console.log(`  Started app: ${appDef.name}:draft`);
      } catch (err) {
        console.error(`  Failed to start ${appDef.name}:draft:`, err);
      }
    }
  }
}
