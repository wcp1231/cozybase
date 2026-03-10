import { parseArgs } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createOperatorMcpServer } from './mcp-server';
import { isProcessAlive, readPidFile } from '../../daemon-ctl';
import { resolveWorkspaceDir } from '../../runtime-paths';

function loadOperatorMcpConfig() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      app: { type: 'string' },
      url: { type: 'string' },
      workspace: { type: 'string', short: 'w' },
    },
    strict: false,
    allowPositionals: true,
  });

  const appSlug = (values.app as string | undefined)?.trim();
  if (!appSlug) {
    throw new Error('Missing required --app <slug> for operator MCP');
  }

  const url = (values.url as string | undefined)
    ?? process.env.COZYBASE_URL
    ?? undefined;
  const workspaceDir = resolveWorkspaceDir({ args: Bun.argv.slice(2) });

  return { appSlug, url, workspaceDir };
}

async function resolveDaemonUrl(config: { url?: string; workspaceDir: string }): Promise<string> {
  if (config.url) {
    return config.url.replace(/\/+$/, '');
  }

  const pidInfo = readPidFile(config.workspaceDir);
  if (pidInfo && isProcessAlive(pidInfo.pid) && pidInfo.port > 0) {
    return `http://127.0.0.1:${pidInfo.port}`;
  }

  throw new Error(
    'No running cozybase daemon detected. Start the daemon or pass --url http://host:port.',
  );
}

function normalizeRuntimePath(path: string): string {
  const normalized = path.replace(/^\/+/, '');
  return normalized.length > 0 ? `/${normalized}` : '';
}

async function main() {
  const config = loadOperatorMcpConfig();
  const daemonUrl = await resolveDaemonUrl(config);
  const callApi = async (path: string, options?: RequestInit): Promise<Response> => {
    const url = `${daemonUrl}/stable/apps/${encodeURIComponent(config.appSlug)}/fn${normalizeRuntimePath(path)}`;
    return fetch(url, {
      ...options,
      method: options?.method ?? 'GET',
    });
  };

  const server = createOperatorMcpServer(callApi);
  const transport = new StdioServerTransport();
  await server.connect(transport);

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
  console.error('Operator MCP server failed to start:', err);
  process.exit(1);
});
