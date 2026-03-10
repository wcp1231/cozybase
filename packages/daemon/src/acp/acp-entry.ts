import { Readable, Writable } from 'node:stream';
import { parseArgs } from 'util';
import { AgentSideConnection, ndJsonStream } from '@agentclientprotocol/sdk';
import { isProcessAlive, readPidFile } from '../daemon-ctl';
import { resolveWorkspaceDir } from '../runtime-paths';
import { CozyBaseAcpServer } from './acp-server';

interface AcpConfig {
  workspaceDir: string;
  daemonUrl: string;
}

function loadAcpConfig(): AcpConfig {
  const args = Bun.argv.slice(2);
  const { values } = parseArgs({
    args,
    options: {
      url: { type: 'string' },
      workspace: { type: 'string', short: 'w' },
    },
    strict: false,
    allowPositionals: true,
  });

  const workspaceDir = resolveWorkspaceDir({ args });
  const daemonUrl = resolveAcpDaemonUrl({
    workspaceDir,
    url: (values.url as string | undefined) ?? process.env.COZYBASE_URL ?? undefined,
  });

  return { workspaceDir, daemonUrl };
}

export function resolveAcpDaemonUrl(config: { workspaceDir: string; url?: string }): string {
  if (config.url?.trim()) {
    return config.url.trim().replace(/\/+$/, '');
  }

  const pidInfo = readPidFile(config.workspaceDir);
  if (pidInfo && isProcessAlive(pidInfo.pid) && pidInfo.port > 0) {
    return `http://127.0.0.1:${pidInfo.port}`;
  }

  throw new Error(
    'No running cozybase daemon detected. Start the daemon or pass --url http://host:port.',
  );
}

export async function runAcpCli(): Promise<void> {
  const config = loadAcpConfig();
  const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>;
  const stream = ndJsonStream(output, input);

  const state: { agent?: CozyBaseAcpServer } = {};
  new AgentSideConnection((agentConnection) => {
    state.agent = new CozyBaseAcpServer(agentConnection, {
      daemonUrl: config.daemonUrl,
      workspaceDir: config.workspaceDir,
    });
    return state.agent;
  }, stream);
  const agent = state.agent;
  if (!agent) {
    throw new Error('Failed to initialize ACP agent');
  }
  agent.bindConnectionLifecycle();

  const shutdown = async () => {
    await agent?.shutdown();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
}

if (import.meta.main) {
  runAcpCli().catch((error) => {
    console.error('ACP server failed to start:', error);
    process.exit(1);
  });
}
