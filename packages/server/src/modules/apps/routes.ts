import { Hono } from 'hono';
import type { Workspace } from '../../core/workspace';

export function createAppRoutes(workspace: Workspace) {
  const app = new Hono();

  // GET /apps - List all apps with derived states
  app.get('/apps', (c) => {
    const apps = workspace.scanApps();

    const appList = apps.map((a) => {
      const state = workspace.getAppState(a.name);
      return {
        name: a.name,
        description: a.spec.description ?? '',
        state: state ?? 'unknown',
        migrations: a.migrations.length,
        seeds: a.seeds.length,
        functions: a.functions,
      };
    });

    return c.json({
      status: 'running',
      version: '0.1.0',
      workspace: workspace.root,
      apps: appList,
    });
  });

  // GET /apps/:appName - Get single app status
  app.get('/apps/:appName', (c) => {
    const appName = c.req.param('appName')!;
    const state = workspace.getAppState(appName);

    if (!state) {
      return c.json({ error: { code: 'NOT_FOUND', message: `App '${appName}' not found` } }, 404);
    }

    const apps = workspace.scanApps();
    const appDef = apps.find((a) => a.name === appName);

    return c.json({
      data: {
        name: appName,
        description: appDef?.spec.description ?? '',
        state,
        migrations: appDef?.migrations.length ?? 0,
        seeds: appDef?.seeds.length ?? 0,
        functions: appDef?.functions ?? [],
      },
    });
  });

  return app;
}
