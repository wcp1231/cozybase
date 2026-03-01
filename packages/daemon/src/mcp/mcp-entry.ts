/**
 * MCP CLI Entry Point — `cozybase mcp`
 *
 * Starts an MCP Server over stdio, connecting AI Agents to cozybase.
 *
 * Usage:
 *   cozybase mcp --apps-dir /path/to/workspace
 *   cozybase mcp --url http://homelab:2765 --apps-dir /path/to/workspace
 *
 * Connects to a running cozybase daemon via HTTP.
 * When --url is provided, connects to the specified daemon.
 * When --url is omitted, auto-detects a local daemon via PID file.
 * Exits with an error if no daemon is available.
 */

import { resolve } from 'path';
import { homedir } from 'os';
import { mkdirSync } from 'fs';
import { parseArgs } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createMcpServer } from './server';
import { readPidFile, isProcessAlive } from '../daemon-ctl';
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
}): Promise<CozybaseBackend> {
  let remoteUrl = config.url;

  // Auto-detect running daemon via PID file
  if (!remoteUrl) {
    const pidInfo = readPidFile(config.workspaceDir);
    if (pidInfo && isProcessAlive(pidInfo.pid) && pidInfo.port > 0) {
      remoteUrl = `http://127.0.0.1:${pidInfo.port}`;
    }
  }

  if (!remoteUrl) {
    console.error(
      'No running cozybase daemon detected.\n\n' +
      'To use cozybase MCP, either:\n' +
      '  1. Start the daemon:  cozybase daemon start\n' +
      '  2. Specify a remote daemon URL:  cozybase mcp --url http://host:port\n',
    );
    process.exit(1);
  }

  const { RemoteBackend } = await import('./remote-backend');
  return new RemoteBackend(remoteUrl);
}

async function main() {
  const config = loadMcpConfig();

  // Ensure apps directory exists
  mkdirSync(config.appsDir, { recursive: true });

  const backend = await createBackend({
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
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('MCP Server failed to start:', err);
  process.exit(1);
});
