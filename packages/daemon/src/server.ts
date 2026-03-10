import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from 'hono/bun';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Config } from './config';
import { Workspace } from './core/workspace';
import { AppErrorRecorder } from './core/app-error-recorder';
import { AppConsoleService } from './core/app-console-service';
import { DraftRebuilder } from './core/draft-rebuilder';
import { Verifier } from './core/verifier';
import { Publisher } from './core/publisher';
import { AppError, BadRequestError } from './core/errors';
import { logger } from './middleware/logger';
import { createAppRoutes } from './modules/apps/routes';
import { createThemeRoutes } from './modules/theme/routes';
import { createSettingsRoutes } from './modules/settings/routes';
import { createRuntime, type AppRegistry, type PlatformHandler } from '@cozybase/runtime';
import { generateThemeCSS } from '@cozybase/ui';
import { UiBridge } from './core/ui-bridge';
import { AppManager } from './modules/apps/manager';
import { extractAppInfo, deduplicateSlug } from '@cozybase/builder-agent';
import { eventBus } from './core/event-bus';
import { ScheduleManager } from './core/schedule-manager';
import { resolveWebDistDir } from './runtime-paths';
import { bootstrapAi } from './ai/bootstrap';

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
  const appErrorRecorder = new AppErrorRecorder(workspace.getPlatformRepo());
  const draftRebuilder = new DraftRebuilder(workspace, appErrorRecorder);
  const verifier = new Verifier(workspace);
  const publisher = new Publisher(workspace, appErrorRecorder);

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

  const {
    app: runtimeApp,
    registry,
    stablePlatformClient,
    draftPlatformClient,
  } = createRuntime({ platformHandler, errorRecorder: appErrorRecorder });

  const scheduleManager = new ScheduleManager({
    platformRepo: workspace.getPlatformRepo(),
    registry,
    stablePlatformClient,
    draftPlatformClient,
    errorRecorder: appErrorRecorder,
  });
  const appConsole = new AppConsoleService(workspace, scheduleManager);

  // --- Startup promise: auto-publish template apps (if first init), then load all apps ---
  const runtimeStartup = initializeRuntime(
    workspace,
    registry,
    publisher,
    scheduleManager,
    justInitialized,
  );

  // --- Shared AppManager (used by REST routes and agent infrastructure) ---
  const appManager = new AppManager(
    workspace,
    registry,
    draftRebuilder,
    {
      onStableStarted: (appSlug) => {
        void scheduleManager.loadApp(appSlug).catch((err) => {
          console.error(`Failed to load schedules for '${appSlug}' after start`, err);
        });
      },
      onStableStopped: (appSlug) => {
        scheduleManager.unloadApp(appSlug);
      },
      onAppDeleted: (appSlug) => {
        scheduleManager.unloadApp(appSlug);
      },
    },
    eventBus,
  );

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
  app.route('/api/v1', createAppRoutes(workspace, appManager, appConsole));

  // --- Theme API ---
  app.route('/api/v1', createThemeRoutes(workspace, registry));

  const platformRepo = workspace.getPlatformRepo();

  // --- Settings API ---
  app.route('/api/v1', createSettingsRoutes(platformRepo));

  // --- Generate initial theme CSS and propagate to runtime ---
  const themeCSS = generateThemeCSS(workspace.getThemeConfig());
  registry.setThemeCSS(themeCSS);

  // --- UI Bridge (Agent → Browser WebSocket relay) ---
  const uiBridge = new UiBridge();

  app.post('/api/v1/ui/inspect', async (c) => {
    const body = await c.req.json<{ app_name: string; page?: string }>();
    if (!body.app_name) {
      throw new BadRequestError('app_name is required');
    }
    try {
      const result = await uiBridge.inspectUi(body.app_name, body.page);
      return c.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'UI_INSPECT_ERROR', message } }, 503);
    }
  });

  // --- Draft management routes: /draft/apps/:appSlug/(rebuild|verify|publish) ---
  // These MUST be registered BEFORE the runtime catch-all at /draft/apps/:name
  // to prevent the runtime's appEntryResolver from hijacking management requests.

  const draftMgmtMiddleware = async (c: any, next: any) => {
    const appSlug = c.req.param('appSlug');
    if (!appSlug) {
      throw new BadRequestError('App slug is required');
    }
    workspace.refreshAppState(appSlug);
    const state = workspace.getAppState(appSlug);
    if (!state) {
      throw new BadRequestError(`App '${appSlug}' not found`);
    }
    await next();
  };

  const handleDraftRebuild = async (c: any) => {
    const appSlug = c.req.param('appSlug')!;
    const result = await draftRebuilder.rebuild(appSlug);

    // Restart draft in Runtime after rebuild
    const appContext = workspace.getOrCreateApp(appSlug);
    if (result.success && appContext?.hasDraftRebuildState()) {
      registry.restart(appSlug, {
        mode: 'draft',
        dbPath: appContext.draftDbPath,
        functionsDir: join(appContext.draftDataDir, 'functions'),
        uiDir: join(appContext.draftDataDir, 'ui'),
      });
      eventBus.emit('app:reconciled', { appSlug });
    }

    return c.json({ data: result });
  };

  app.post('/draft/apps/:appSlug/rebuild', draftMgmtMiddleware, handleDraftRebuild);

  app.post('/draft/apps/:appSlug/verify', draftMgmtMiddleware, (c) => {
    const appSlug = c.req.param('appSlug')!;
    const result = verifier.verify(appSlug);
    return c.json({ data: result });
  });

  app.post('/draft/apps/:appSlug/publish', draftMgmtMiddleware, async (c) => {
    const appSlug = c.req.param('appSlug')!;
    const result = await publisher.publish(appSlug);

    if (result.success) {
      workspace.refreshAppState(appSlug);
      const state = workspace.getAppState(appSlug);

      const appContext = workspace.getOrCreateApp(appSlug);
      if (appContext && state?.stableStatus === 'running') {
        registry.restart(appSlug, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
      } else {
        try {
          registry.stop(appSlug, 'stable');
        } catch {
          // Ignore if stable was not running.
        }
      }

      try {
        registry.stop(appSlug, 'draft');
      } catch {
        // Ignore if draft was not running.
      }

      if (state?.stableStatus === 'running') {
        await scheduleManager.reloadApp(appSlug);
      } else {
        scheduleManager.unloadApp(appSlug);
      }
    }

    return c.json({ data: result });
  });

  app.post('/draft/apps/:appSlug/schedule/:scheduleName/trigger', draftMgmtMiddleware, async (c) => {
    const appSlug = c.req.param('appSlug')!;
    const scheduleName = c.req.param('scheduleName')!;
    const result = await scheduleManager.triggerManual(appSlug, scheduleName, 'draft');
    return c.json({ data: result });
  });

  app.post('/stable/apps/:appSlug/schedule/:scheduleName/trigger', draftMgmtMiddleware, async (c) => {
    const appSlug = c.req.param('appSlug')!;
    const scheduleName = c.req.param('scheduleName')!;
    const result = await scheduleManager.triggerManual(appSlug, scheduleName, 'stable');
    return c.json({ data: result });
  });

  // Auto-prepare draft runtime for stable-only apps on any draft route access
  app.use('/draft/apps/:name/*', async (c, next) => {
    const name = c.req.param('name');
    if (name) {
      const result = await appManager.prepareDraftRuntime(name);
      if (result.status === 'error' && result.error) {
        throw new AppError(result.error.statusCode, result.error.message, result.error.code);
      }
    }
    return next();
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

  const {
    agentDir,
    chatSessionManager,
    operatorSessionManager,
    resolveBuilderRuntime,
    startup,
    shutdown: shutdownAgentInfra,
  } = bootstrapAi({
    config,
    workspace,
    app,
    registry,
    stablePlatformClient,
    appManager,
    draftRebuilder,
    verifier,
    publisher,
    scheduleManager,
    uiBridge,
    eventBus,
    runtimeStartup,
  });

  // Wire session cleanup so app delete/rename cleans up both agent types.
  appManager.setSessionCleanup({
    remove(appSlug: string) {
      chatSessionManager.remove(appSlug);
      operatorSessionManager.remove(appSlug);
    },
  });

  // --- AI-powered app creation endpoint ---
  app.post('/api/v1/apps/create-with-ai', async (c) => {
    let body: { idea?: string };
    try {
      body = await c.req.json();
    } catch {
      throw new BadRequestError('Invalid JSON body');
    }

    if (!body.idea?.trim()) {
      throw new BadRequestError('Request body must include a non-empty "idea" field');
    }

    // 1. Extract structured app info from free-text via LLM
    const builderRuntime = resolveBuilderRuntime();
    const info = await extractAppInfo(body.idea.trim(), {
      provider: builderRuntime.agentProvider,
      cwd: agentDir,
      model: typeof builderRuntime.model === 'string' ? builderRuntime.model : undefined,
      providerOptions: builderRuntime.providerOptionsFactory?.({
        appSlug: '__extract__',
        agentDir,
        mode: 'extract',
      }),
    });

    // 2. Deduplicate slug against existing apps
    const slug = deduplicateSlug(info.slug, (s) => appManager.exists(s));

    // 3. Create app (includes auto-rebuild)
    const result = await appManager.create(slug, info.description, info.displayName);

    // 4. Start Agent with the original idea text (fire-and-forget)
    const session = chatSessionManager.getOrCreate(slug);
    session.injectPrompt(body.idea.trim()).catch((err) => {
      console.error(`Failed to inject prompt for '${slug}':`, err);
    });

    // 5. Return slug for frontend navigation
    const data: Record<string, unknown> = {
      slug: result.app.slug,
      displayName: result.app.displayName,
      description: result.app.description,
    };
    if (result.rebuildError) {
      data.rebuildError = result.rebuildError;
    }
    return c.json({ data }, 201);
  });

  // --- Web UI static files ---
  const webDistDir = resolveWebDistDir();

  if (existsSync(webDistDir)) {
    app.use('/assets/*', serveStatic({ root: webDistDir }));
    app.use('/favicon.ico', serveStatic({ root: webDistDir }));

    // Serve index.html with theme CSS injected
    app.get('*', (c) => {
      const indexPath = join(webDistDir, 'index.html');
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

  return {
    app,
    workspace,
    registry,
    uiBridge,
    chatSessionManager,
    operatorSessionManager,
    appManager,
    draftRebuilder,
    verifier,
    publisher,
    startup,
    scheduleManager,
    shutdownAgentInfra,
  };
}

/**
 * Auto-publish template apps on first init, then start all known apps in the Runtime registry.
 */
async function initializeRuntime(
  workspace: Workspace,
  registry: AppRegistry,
  publisher: Publisher,
  scheduleManager: ScheduleManager,
  justInitialized: boolean,
) {
  // Auto-publish template apps on first workspace initialization
  if (justInitialized) {
    console.log('Auto-publishing template apps...');
    workspace.refreshAllAppStates();
    for (const appDef of workspace.scanApps()) {
      const state = workspace.getAppState(appDef.slug);
      if (state?.stableStatus === null && state.hasDraft) {
        console.log(`  Auto-publishing template app: ${appDef.slug}`);
        try {
          const result = await publisher.publish(appDef.slug);
          if (result.success) {
            console.log(`  Published: ${appDef.slug}`);
            workspace.refreshAppState(appDef.slug);
          } else {
            console.error(`  Failed to auto-publish '${appDef.slug}': ${result.error}`);
          }
        } catch (err) {
          console.error(`  Failed to auto-publish '${appDef.slug}':`, err);
        }
      }
    }
  }

  // Start all apps in the Runtime registry
  for (const appDef of workspace.scanApps()) {
    const state = workspace.getAppState(appDef.slug);
    const appContext = workspace.getOrCreateApp(appDef.slug);
    if (!appContext || !state) continue;

    if (state.stableStatus === 'running') {
      try {
        registry.start(appDef.slug, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
        console.log(`  Started app: ${appDef.slug}:stable`);
        await scheduleManager.loadApp(appDef.slug);
      } catch (err) {
        console.error(`  Failed to start ${appDef.slug}:stable:`, err);
      }
    }

    const hasMaterializedDraft = appContext.hasDraftRebuildState();
    const shouldStartDraft = hasMaterializedDraft && state.hasDraft;

    if (shouldStartDraft) {
      try {
        registry.start(appDef.slug, {
          mode: 'draft',
          dbPath: appContext.draftDbPath,
          functionsDir: join(appContext.draftDataDir, 'functions'),
          uiDir: join(appContext.draftDataDir, 'ui'),
        });
        console.log(`  Started app: ${appDef.slug}:draft`);
      } catch (err) {
        console.error(`  Failed to start ${appDef.slug}:draft:`, err);
      }
    }
  }
}
