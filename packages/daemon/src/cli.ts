#!/usr/bin/env bun

import { resolve } from 'path';
import { readFileSync } from 'fs';

function getVersion(): string {
  const pkgPath = resolve(import.meta.dir, '../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  return pkg.version ?? '0.0.0';
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

  Options:
    --help, -h          Show this help message
    --version, -v       Show version number
`);
}

async function handleDaemon(subcommand: string | undefined) {
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
    default:
      console.error(`Unknown daemon command: ${subcommand}\n`);
      printHelp();
      process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'daemon':
    await handleDaemon(args[1]);
    break;

  case 'mcp':
    await import('./mcp/mcp-entry');
    break;

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
