import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import type { Config } from './config';
import { Workspace } from './core/workspace';
import { DraftReconciler } from './core/draft-reconciler';
import { Verifier } from './core/verifier';
import { Publisher } from './core/publisher';
import { AppError, BadRequestError } from './core/errors';
import { logger } from './middleware/logger';
import { appResolver, type AppEnv } from './middleware/app-resolver';
import { createAppRoutes } from './modules/apps/routes';
import { createDbRoutes } from './modules/db/routes';
import { createFunctionRoutes } from './modules/functions/routes';
import { DirectRuntime } from './modules/functions/direct-runtime';

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
  const functionRuntime = new DirectRuntime();
  publisher.setFunctionRuntime(functionRuntime);

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
  app.route('/api/v1', createAppRoutes(workspace));

  // --- Stable DB routes: /stable/apps/:appName/db/* ---
  const stableDb = new Hono();
  stableDb.use('*', appResolver(workspace, 'stable'));
  stableDb.route('/', createDbRoutes());
  app.route('/stable/apps/:appName/db', stableDb);

  // --- Draft DB routes: /draft/apps/:appName/db/* ---
  const draftDb = new Hono();
  draftDb.use('*', appResolver(workspace, 'draft'));
  draftDb.route('/', createDbRoutes());
  app.route('/draft/apps/:appName/db', draftDb);

  // --- Stable Function routes: /stable/apps/:appName/functions/:name ---
  const stableFn = new Hono();
  stableFn.use('*', appResolver(workspace, 'stable'));
  stableFn.route('/', createFunctionRoutes(functionRuntime));
  app.route('/stable/apps/:appName/functions', stableFn);

  // --- Draft Function routes: /draft/apps/:appName/functions/:name ---
  const draftFn = new Hono();
  draftFn.use('*', appResolver(workspace, 'draft'));
  draftFn.route('/', createFunctionRoutes(functionRuntime));
  app.route('/draft/apps/:appName/functions', draftFn);

  // --- Stable UI route: /stable/apps/:appName/ui ---
  const stableUi = new Hono<AppEnv>();
  stableUi.use('*', appResolver(workspace, 'stable'));
  stableUi.get('/', (c) => {
    const appContext = c.get('appContext');
    const uiPath = join(appContext.stableDataDir, 'ui', 'pages.json');
    if (!existsSync(uiPath)) {
      return c.json({ error: 'UI definition not found' }, 404);
    }
    const content = readFileSync(uiPath, 'utf-8');
    return c.json({ data: JSON.parse(content) });
  });
  app.route('/stable/apps/:appName/ui', stableUi);

  // --- Draft UI route: /draft/apps/:appName/ui ---
  const draftUi = new Hono<AppEnv>();
  draftUi.use('*', appResolver(workspace, 'draft'));
  draftUi.get('/', (c) => {
    const appContext = c.get('appContext');
    const uiPath = join(appContext.draftDataDir, 'ui', 'pages.json');
    if (!existsSync(uiPath)) {
      return c.json({ error: 'UI definition not found' }, 404);
    }
    const content = readFileSync(uiPath, 'utf-8');
    return c.json({ data: JSON.parse(content) });
  });
  app.route('/draft/apps/:appName/ui', draftUi);

  // --- Draft management routes: /draft/apps/:appName/(reconcile|verify|publish) ---
  const draftMgmt = new Hono();

  // Lightweight validation (core classes do their own state checks)
  draftMgmt.use('*', async (c, next) => {
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
  });

  draftMgmt.post('/reconcile', async (c) => {
    const appName = c.req.param('appName')!;
    const result = await draftReconciler.reconcile(appName);
    return c.json({ data: result });
  });

  draftMgmt.post('/verify', (c) => {
    const appName = c.req.param('appName')!;
    const result = verifier.verify(appName);
    return c.json({ data: result });
  });

  draftMgmt.post('/publish', (c) => {
    const appName = c.req.param('appName')!;
    const result = publisher.publish(appName);
    return c.json({ data: result });
  });

  app.route('/draft/apps/:appName', draftMgmt);

  // --- Admin SPA static files ---
  // Resolve the admin build directory (relative to the server package)
  const adminDistDir = resolve(import.meta.dir, '..', '..', '..', 'admin', 'dist');

  if (existsSync(adminDistDir)) {
    // Serve static assets from admin build
    app.use(
      '/assets/*',
      serveStatic({ root: adminDistDir }),
    );

    // Serve other static files (favicon, etc.)
    app.use(
      '/favicon.ico',
      serveStatic({ root: adminDistDir }),
    );

    // SPA fallback: any unmatched GET request returns index.html
    app.get('*', serveStatic({ root: adminDistDir, path: '/index.html' }));
  }

  return { app, workspace, functionRuntime, draftReconciler, verifier, publisher };
}
