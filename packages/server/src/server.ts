import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Config } from './config';
import { Workspace } from './core/workspace';
import { Reconciler } from './core/reconciler';
import { AppError } from './core/errors';
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

  const reconciler = new Reconciler(workspace);

  // --- Initial reconcile ---
  console.log('Reconciling workspace...');
  const changes = reconciler.reconcileAll();
  for (const change of changes) {
    const icon = change.warning ? '⚠' : '✓';
    console.log(`  ${icon} [${change.app}] ${change.type}: ${change.resource}${change.detail ? ` (${change.detail})` : ''}`);
  }
  if (changes.length === 0) {
    console.log('  No changes needed');
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

  // --- Platform API ---
  app.route('/api/v1', createAppRoutes(workspace, reconciler));

  // --- App-scoped API ---
  const appScoped = new Hono();

  // Resolve app from workspace
  appScoped.use('*', appResolver(workspace));

  // Mount DB module
  appScoped.route('/db', createDbRoutes());

  // Mount app-scoped routes under /api/v1/app/:appName
  app.route('/api/v1/app/:appName', appScoped);

  return { app, workspace };
}
