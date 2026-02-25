import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Config } from './config';
import { Workspace } from './core/workspace';
import { DraftReconciler } from './core/draft-reconciler';
import { Verifier } from './core/verifier';
import { Publisher } from './core/publisher';
import { AppError, BadRequestError } from './core/errors';
import { logger } from './middleware/logger';
import { appResolver } from './middleware/app-resolver';
import { createAppRoutes } from './modules/apps/routes';
import { createDbRoutes } from './modules/db/routes';

export function createServer(config: Config) {
  const app = new Hono();

  // --- Initialize workspace ---
  const workspace = new Workspace(config.workspaceDir);

  if (!workspace.isInitialized()) {
    console.log('Initializing new workspace...');
    workspace.init();
    console.log(`  Workspace created at ${workspace.root}`);
  }

  workspace.load();

  // --- Core services ---
  const draftReconciler = new DraftReconciler(workspace);
  const verifier = new Verifier(workspace);
  const publisher = new Publisher(workspace);

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

  draftMgmt.post('/reconcile', (c) => {
    const appName = c.req.param('appName')!;
    const result = draftReconciler.reconcile(appName);
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

  return { app, workspace };
}
