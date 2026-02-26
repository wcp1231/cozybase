/**
 * MCP CLI Entry Point — `cozybase mcp`
 *
 * Starts an MCP Server over stdio, connecting AI Agents to cozybase.
 *
 * Usage:
 *   cozybase mcp --apps-dir /path/to/workspace
 *   cozybase mcp --url http://homelab:2765 --apps-dir /path/to/workspace
 *
 * When --url is omitted, runs in embedded mode (local, no network).
 * When --url is provided, runs in remote mode (HTTP API).
 */

import { resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { parseArgs } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer } from './server';
import type { CozybaseBackend } from './types';

function loadMcpConfig() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      'apps-dir': { type: 'string' },
      url: { type: 'string' },
      workspace: { type: 'string', short: 'w' },
    },
    strict: false,
    allowPositionals: true,
  });

  const appsDir = resolve(
    (values['apps-dir'] as string | undefined)
    ?? process.env.COZYBASE_APPS_DIR
    ?? process.cwd(),
  );

  const url = (values.url as string | undefined)
    ?? process.env.COZYBASE_URL
    ?? undefined;

  const workspaceDir = resolve(
    (values.workspace as string | undefined)
    ?? process.env.COZYBASE_WORKSPACE
    ?? resolve(homedir(), '.cozybase'),
  );

  return { appsDir, url, workspaceDir };
}

async function createBackend(config: {
  url?: string;
  workspaceDir: string;
}): Promise<{ backend: CozybaseBackend; cleanup: () => void }> {
  if (config.url) {
    // Remote mode — import dynamically to avoid loading unused deps
    const { RemoteBackend } = await import('./remote-backend');
    return {
      backend: new RemoteBackend(config.url),
      cleanup: () => {},
    };
  }

  // Embedded mode — initialize full server (workspace + Hono app + core services)
  const { createServer } = await import('../server');

  const { app, workspace, functionRuntime, draftReconciler, verifier, publisher } =
    createServer({
      port: 0, // not used in MCP mode
      host: '127.0.0.1',
      workspaceDir: config.workspaceDir,
      jwtSecret: 'mcp-embedded',
    });

  const { EmbeddedBackend } = await import('./embedded-backend');
  const backend = new EmbeddedBackend(
    workspace,
    draftReconciler,
    verifier,
    publisher,
    app,
  );

  return {
    backend,
    cleanup: () => {
      functionRuntime.shutdown();
      workspace.close();
    },
  };
}

async function main() {
  const config = loadMcpConfig();

  // Ensure apps directory exists
  mkdirSync(config.appsDir, { recursive: true });

  const { backend, cleanup } = await createBackend({
    url: config.url,
    workspaceDir: config.workspaceDir,
  });

  const server = createMcpServer({
    backend,
    appsDir: config.appsDir,
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    await server.close();
    cleanup();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    cleanup();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
