import { loadConfig } from './config';
import { createServer } from './server';

const config = loadConfig();
const { app, workspace } = createServer(config);

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch: app.fetch,
});

console.log(`
  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0            ║
  ╠═══════════════════════════════════════╣
  ║  Local BaaS Platform for AI Agents   ║
  ╚═══════════════════════════════════════╝

  Server:    http://${config.host}:${config.port}
  Workspace: ${config.workspaceDir}

  API:
    GET  /health
    GET  /api/v1/apps
    GET  /api/v1/apps/:appName
    *    /stable/apps/:appName/db/*
    *    /draft/apps/:appName/db/*
    POST /draft/apps/:appName/reconcile
    POST /draft/apps/:appName/verify
    POST /draft/apps/:appName/publish
`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  workspace.close();
  server.stop();
  process.exit(0);
});
