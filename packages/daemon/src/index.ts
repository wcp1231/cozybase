import { loadConfig } from './config';
import { createServer } from './server';
import { writePidFile, cleanupPidFile } from './daemon-ctl';

const config = loadConfig();
const { app, workspace, registry, uiBridge, startup } = createServer(config);

// Wait for all apps to start before accepting requests
await startup;

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch(req, server) {
    // Handle WebSocket upgrade for Agent ↔ Browser UI bridge
    const url = new URL(req.url);
    if (url.pathname === '/api/v1/agent/ws') {
      if (server.upgrade(req)) {
        return undefined as unknown as Response;
      }
      return new Response('WebSocket upgrade failed', { status: 400 });
    }
    // All other requests go to Hono
    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      uiBridge.addSession(ws);
    },
    message(ws, message) {
      uiBridge.handleMessage(ws, typeof message === 'string' ? message : message.toString());
    },
    close(ws) {
      uiBridge.removeSession(ws);
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
    POST /api/v1/ui/inspect
    *    /stable/apps/:appName/fn/:fnName
    *    /stable/apps/:appName/fn/_db/*
    *    /draft/apps/:appName/fn/:fnName
    *    /draft/apps/:appName/fn/_db/*
    POST /draft/apps/:appName/reconcile
    POST /draft/apps/:appName/verify
    POST /draft/apps/:appName/publish
`);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  cleanupPidFile(config.workspaceDir);

  // Close all browser WebSocket sessions
  uiBridge.shutdown();

  // Shutdown all apps in Runtime
  registry.shutdownAll();

  workspace.close();
  server.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
