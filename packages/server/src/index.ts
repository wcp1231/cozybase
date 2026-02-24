import { loadConfig } from './config';
import { createServer } from './server';

const config = loadConfig();
const { app, dbPool, watcher } = createServer(config);

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
  Data:      ${config.dataDir}

  API:
    GET  /health
    GET  /api/v1/status
    POST /api/v1/reconcile
    *    /api/v1/app/:appName/db/*
`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  watcher.stop();
  dbPool.closeAll();
  server.stop();
  process.exit(0);
});
