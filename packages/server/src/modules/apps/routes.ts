import { Hono } from 'hono';
import type { Workspace } from '../../core/workspace';
import type { Reconciler } from '../../core/reconciler';

export function createAppRoutes(workspace: Workspace, reconciler: Reconciler) {
  const app = new Hono();

  // GET /status - Platform status + all apps
  app.get('/status', (c) => {
    const apps = workspace.scanApps();
    const platformDb = workspace.getPlatformDb();

    const appStatuses = apps.map((a) => {
      const tables = [...a.tables.keys()];
      const functions = a.functions;

      // Get resource state from DB
      const resources = platformDb.query(
        'SELECT resource_type, resource_name, applied_at FROM resource_state WHERE app_name = ?',
      ).all(a.name) as { resource_type: string; resource_name: string; applied_at: string }[];

      return {
        name: a.name,
        description: a.spec.description ?? '',
        tables,
        functions,
        resources,
      };
    });

    return c.json({
      status: 'running',
      version: '0.1.0',
      workspace: workspace.root,
      apps: appStatuses,
    });
  });

  // POST /reconcile - Manual full reconcile
  app.post('/reconcile', (c) => {
    const changes = reconciler.reconcileAll();
    return c.json({ data: { changes } });
  });

  return app;
}
