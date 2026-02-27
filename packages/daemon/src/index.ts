import { loadConfig } from './config';
import { createServer } from './server';
import { writePidFile, cleanupPidFile } from './daemon-ctl';

const config = loadConfig();
const { app, workspace, registry, startup } = createServer(config);

// Wait for all apps to start before accepting requests
await startup;

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
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
    *    /stable/apps/:appName/fn/:fnName
    *    /stable/apps/:appName/db/*
    *    /draft/apps/:appName/fn/:fnName
    *    /draft/apps/:appName/db/*
    POST /draft/apps/:appName/reconcile
    POST /draft/apps/:appName/verify
    POST /draft/apps/:appName/publish
`);

// Graceful shutdown
async function shutdown() {
  console.log('\nShutting down...');
  cleanupPidFile(config.workspaceDir);

  // Shutdown all apps in Runtime
  registry.shutdownAll();

  workspace.close();
  server.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
