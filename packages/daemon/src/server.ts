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
import { createAppRoutes } from './modules/apps/routes';
import { createThemeRoutes } from './modules/theme/routes';
import { createRuntime, type AppRegistry, type PlatformHandler } from '@cozybase/runtime';
import { generateThemeCSS } from '@cozybase/ui';

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
  const platformHandler: PlatformHandler = {
    async handle(path, request) {
      const normalizedPath = path.replace(/^\/+/, '');
      let daemonPath: string | null = null;
      if (normalizedPath === 'auth/verify') {
        daemonPath = '/internal/auth/verify';
      } else if (normalizedPath === 'theme/css') {
        daemonPath = '/api/v1/theme/css';
      }

      if (!daemonPath) {
        return new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: `Unknown _platform path '${normalizedPath}'` } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const requestUrl = new URL(request.url);
      const mappedRequest = new Request(`http://localhost${daemonPath}${requestUrl.search}`, request);
      return app.request(mappedRequest);
    },
  };

  const { app: runtimeApp, registry } = createRuntime({ platformHandler });

  // --- Startup promise: auto-publish template apps (if first init), then load all apps ---
  const startup = initializeRuntime(workspace, registry, publisher, justInitialized);

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

  // --- Theme API ---
  app.route('/api/v1', createThemeRoutes(workspace, registry));

  // --- Generate initial theme CSS and propagate to runtime ---
  const themeCSS = generateThemeCSS(workspace.getThemeConfig());
  registry.setThemeCSS(themeCSS);

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
    const result = await publisher.publish(appName);

    if (result.success) {
      workspace.refreshAppState(appName);
      const state = workspace.getAppState(appName);

      const appContext = workspace.getOrCreateApp(appName);
      if (appContext && state?.stableStatus === 'running') {
        registry.restart(appName, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
      } else {
        try {
          registry.stop(appName, 'stable');
        } catch {
          // Ignore if stable was not running.
        }
      }

      try {
        registry.stop(appName, 'draft');
      } catch {
        // Ignore if draft was not running.
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
  const adminDistDir = resolve(import.meta.dir, '..', '..', 'admin', 'dist');

  if (existsSync(adminDistDir)) {
    app.use('/assets/*', serveStatic({ root: adminDistDir }));
    app.use('/favicon.ico', serveStatic({ root: adminDistDir }));

    // Serve index.html with theme CSS injected
    app.get('*', (c) => {
      const indexPath = join(adminDistDir, 'index.html');
      const html = readFileSync(indexPath, 'utf-8');
      const css = registry.getThemeCSS();
      if (css) {
        // Escape </style sequences to prevent breaking out of the style tag
        const safeCSS = css.replace(/<\/style/gi, '<\\/style');
        return c.html(html.replace('</head>', `<style id="cz-theme">${safeCSS}</style>\n</head>`));
      }
      return c.html(html);
    });
  }

  return { app, workspace, registry, draftReconciler, verifier, publisher, startup };
}

/**
 * Auto-publish template apps on first init, then start all known apps in the Runtime registry.
 */
async function initializeRuntime(
  workspace: Workspace,
  registry: AppRegistry,
  publisher: Publisher,
  justInitialized: boolean,
) {
  // Auto-publish template apps on first workspace initialization
  if (justInitialized) {
    console.log('Auto-publishing template apps...');
    workspace.refreshAllAppStates();
    for (const appDef of workspace.scanApps()) {
      const state = workspace.getAppState(appDef.name);
      if (state?.stableStatus === null && state.hasDraft) {
        console.log(`  Auto-publishing template app: ${appDef.name}`);
        try {
          const result = await publisher.publish(appDef.name);
          if (result.success) {
            console.log(`  Published: ${appDef.name}`);
            workspace.refreshAppState(appDef.name);
          } else {
            console.error(`  Failed to auto-publish '${appDef.name}': ${result.error}`);
          }
        } catch (err) {
          console.error(`  Failed to auto-publish '${appDef.name}':`, err);
        }
      }
    }
  }

  // Start all apps in the Runtime registry
  for (const appDef of workspace.scanApps()) {
    const state = workspace.getAppState(appDef.name);
    const appContext = workspace.getOrCreateApp(appDef.name);
    if (!appContext || !state) continue;

    if (state.stableStatus === 'running') {
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

    if (state.hasDraft) {
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
