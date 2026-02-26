import { loadConfig } from './config';
import { createServer } from './server';
import { writePidFile, cleanupPidFile } from './daemon-ctl';

const config = loadConfig();
const { app, workspace, functionRuntime } = createServer(config);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

// Write PID and port files for daemon management
writePidFile(config.workspaceDir, process.pid, server.port);

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
    *    /stable/apps/:appName/db/*
    *    /draft/apps/:appName/db/*
    *    /stable/apps/:appName/functions/:name
    *    /draft/apps/:appName/functions/:name
    POST /draft/apps/:appName/reconcile
    POST /draft/apps/:appName/verify
    POST /draft/apps/:appName/publish
`);

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down...');
  cleanupPidFile(config.workspaceDir);
  functionRuntime.shutdown();
  workspace.close();
  server.stop();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
