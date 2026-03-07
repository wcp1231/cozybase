#!/usr/bin/env bun

import { resolve } from 'path';
import { readFileSync } from 'fs';

function getVersion(): string {
  const configured = process.env.COZYBASE_VERSION?.trim();
  if (configured) {
    return configured;
  }

  try {
    const pkgPath = resolve(import.meta.dir, '../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.1.0';
  }
}

function printHelp() {
  const version = getVersion();
  console.log(`
  cozybase v${version} — Local BaaS Platform for AI Agents

  Usage:
    cozybase <command> [options]

  Commands:
    daemon              Manage the HTTP server
      start             Start the daemon (default)
      stop              Stop the running daemon
      restart           Restart the daemon
      status            Show daemon status
    mcp                 Start the MCP server (stdio)
    init                Initialize Agent Workspace (AGENTS.md, Skills)

  Options:
    --help, -h          Show this help message
    --version, -v       Show version number
`);
}

const DAEMON_SUBCOMMANDS = new Set(['start', 'stop', 'restart', 'status']);

async function handleDaemon(args: string[]) {
  const subcommand = args[0] && DAEMON_SUBCOMMANDS.has(args[0]) ? args[0] : undefined;
  switch (subcommand) {
    case 'stop': {
      const { stopDaemon } = await import('./daemon-ctl');
      await stopDaemon();
      break;
    }
    case 'status': {
      const { daemonStatus } = await import('./daemon-ctl');
      daemonStatus();
      break;
    }
    case 'restart': {
      const { stopDaemon, readPidFile, getWorkspaceDir, isProcessAlive } = await import('./daemon-ctl');
      const ws = getWorkspaceDir();
      const info = readPidFile(ws);
      if (info && isProcessAlive(info.pid)) {
        await stopDaemon();
      }
      await import('./index');
      break;
    }
    case 'start':
    case undefined:
      await import('./index');
      break;
  }
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'daemon':
    await handleDaemon(args.slice(1));
    break;

  case 'mcp':
    await import('./mcp/mcp-entry');
    break;

  case 'init': {
    const { parseArgs } = await import('util');
    const { initWorkspace } = await import('./workspace-init');
    const { values } = parseArgs({
      args: args.slice(1),
      options: { 'apps-dir': { type: 'string' } },
      strict: false,
    });
    const targetDir = resolve(
      (values['apps-dir'] as string | undefined)
        ?? process.env.COZYBASE_APPS_DIR
        ?? process.cwd(),
    );
    const result = initWorkspace(targetDir);
    if (result.created.length > 0) {
      console.log('Created:');
      for (const f of result.created) console.log(`  + ${f}`);
    }
    if (result.skipped.length > 0) {
      console.log('Skipped (already exist):');
      for (const f of result.skipped) console.log(`  - ${f}`);
    }
    if (result.created.length === 0 && result.skipped.length === 0) {
      console.log('No template files to copy.');
    }
    break;
  }

  case '--version':
  case '-v':
    console.log(`cozybase v${getVersion()}`);
    break;

  case '--help':
  case '-h':
  case undefined:
    printHelp();
    break;

  default:
    console.error(`Unknown command: ${command}\n`);
    printHelp();
    process.exit(1);
}
