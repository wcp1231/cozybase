import { loadConfig } from './config';
import { createServer } from './server';
import { writePidFile, cleanupPidFile } from './daemon-ctl';
import type { OperatorSession } from './ai/operator/session';
import type { CozyBaseSession } from './ai/cozybase/session';

const config = loadConfig();
const {
  app,
  workspace,
  registry,
  uiBridge,
  chatSessionManager,
  operatorSessionManager,
  cozybaseSessionManager,
  startup,
  shutdownAgentInfra,
} = createServer(config);

// Wait for all apps to start before accepting requests
await startup;

interface WsData {
  type: 'agent-bridge' | 'chat' | 'operator' | 'cozybase';
  appSlug?: string;
  operatorSession?: OperatorSession;
  cozybaseSession?: CozyBaseSession;
}

const server = Bun.serve<WsData>({
  port: config.port,
  hostname: config.host,
  fetch(req, server) {
    const url = new URL(req.url);

    // Handle WebSocket upgrade for Agent ↔ Browser UI bridge
    if (url.pathname === '/api/v1/agent/ws') {
      if (server.upgrade(req, { data: { type: 'agent-bridge' } })) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // Handle WebSocket upgrade for Chat (per-app session)
    if (url.pathname === '/api/v1/chat/ws') {
      const appSlug = url.searchParams.get('app');
      if (!appSlug) {
        return new Response('Missing required "app" query parameter', { status: 400 });
      }
      if (server.upgrade(req, { data: { type: 'chat', appSlug } })) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    if (url.pathname === '/api/v1/operator/ws') {
      const appSlug = url.searchParams.get('app');
      if (!appSlug) {
        return new Response('Missing required "app" query parameter', { status: 400 });
      }
      if (server.upgrade(req, { data: { type: 'operator', appSlug } })) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    if (url.pathname === '/api/v1/cozybase/ws') {
      if (server.upgrade(req, { data: { type: 'cozybase' } })) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }

    // All other requests go to Hono
    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      if (ws.data.type === 'chat' && ws.data.appSlug) {
        const session = chatSessionManager.getOrCreate(ws.data.appSlug);
        session.connect(ws as any);
      } else if (ws.data.type === 'operator' && ws.data.appSlug) {
        try {
          const session = operatorSessionManager.getOrCreate(ws.data.appSlug);
          ws.data.operatorSession = session;
          session.connect(ws as any);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'session.error', message }));
          ws.close(1011, message);
        }
      } else if (ws.data.type === 'cozybase') {
        const session = cozybaseSessionManager.getOrCreate();
        ws.data.cozybaseSession = session;
        session.connect(ws as any);
      } else if (ws.data.type === 'agent-bridge') {
        uiBridge.addSession(ws as any);
      }
    },
    message(ws, message) {
      const raw = typeof message === 'string' ? message : message.toString();
      if (ws.data.type === 'chat' && ws.data.appSlug) {
        const session = chatSessionManager.getOrCreate(ws.data.appSlug);
        session.handleMessage(ws as any, raw);
      } else if (ws.data.type === 'operator' && ws.data.appSlug) {
        let session: OperatorSession;
        try {
          session = ws.data.operatorSession ?? operatorSessionManager.getOrCreate(ws.data.appSlug);
          ws.data.operatorSession = session;
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'session.error', message: errorMessage }));
          ws.close(1011, errorMessage);
          return;
        }
        void session.handleMessage(ws as any, raw)
          .catch((err) => {
            const errorMessage = err instanceof Error ? err.message : String(err);
            ws.send(JSON.stringify({ type: 'session.error', message: errorMessage }));
            ws.close(1011, errorMessage);
          });
      } else if (ws.data.type === 'cozybase') {
        const session = ws.data.cozybaseSession ?? cozybaseSessionManager.getOrCreate();
        ws.data.cozybaseSession = session;
        void session.handleMessage(ws as any, raw).catch((err) => {
          const errorMessage = err instanceof Error ? err.message : String(err);
          ws.send(JSON.stringify({ type: 'session.error', message: errorMessage }));
          ws.close(1011, errorMessage);
        });
      } else if (ws.data.type === 'agent-bridge') {
        uiBridge.handleMessage(ws as any, raw);
      }
    },
    close(ws) {
      if (ws.data.type === 'chat' && ws.data.appSlug) {
        const session = chatSessionManager.get(ws.data.appSlug);
        session?.disconnect(ws as any);
      } else if (ws.data.type === 'operator' && ws.data.appSlug) {
        const session = ws.data.operatorSession ?? operatorSessionManager.get(ws.data.appSlug);
        session?.disconnect(ws as any);
      } else if (ws.data.type === 'cozybase') {
        const session = ws.data.cozybaseSession ?? cozybaseSessionManager.getOrCreate();
        session.disconnect(ws as any);
      } else if (ws.data.type === 'agent-bridge') {
        uiBridge.removeSession(ws as any);
      }
    },
  },
});

// Write PID and port files for daemon management
writePidFile(config.workspaceDir, process.pid, server.port ?? config.port);

console.log(`
  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0             ║
  ╠═══════════════════════════════════════╣
  ║  Local BaaS Platform for AI Agents    ║
  ╚═══════════════════════════════════════╝

  Server:    http://${config.host}:${config.port}
  Workspace: ${config.workspaceDir}

  API:
    GET  /health
    GET  /api/v1/apps
    GET  /api/v1/apps/:appName
    WS   /api/v1/agent/ws
    WS   /api/v1/chat/ws?app=<appName>
    WS   /api/v1/operator/ws?app=<appName>
    WS   /api/v1/cozybase/ws
    POST /api/v1/ui/inspect
    *    /stable/apps/:appName/fn/:fnName
    *    /stable/apps/:appName/fn/_db/*
    *    /draft/apps/:appName/fn/:fnName
    *    /draft/apps/:appName/fn/_db/*
    POST /draft/apps/:appName/rebuild
    POST /draft/apps/:appName/verify
    POST /draft/apps/:appName/publish
`);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  cleanupPidFile(config.workspaceDir);

  // Close all browser WebSocket sessions
  uiBridge.shutdown();

  // Shutdown all chat sessions
  chatSessionManager.shutdown();
  operatorSessionManager.shutdown();
  cozybaseSessionManager.shutdown();

  // Shutdown provider-owned resources (e.g. Codex MCP bridge)
  await shutdownAgentInfra?.();

  // Shutdown all apps in Runtime
  registry.shutdownAll();

  workspace.close();
  server.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
