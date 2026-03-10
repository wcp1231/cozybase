import { parseArgs } from 'util';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { isProcessAlive, readPidFile } from '../../daemon-ctl';
import { resolveWorkspaceDir } from '../../runtime-paths';
import { createCozyBaseMcpServer } from './mcp-server';
import { createRemoteCozyBaseActionContext } from './remote-context';

function loadCozyBaseMcpConfig() {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      url: { type: 'string' },
      workspace: { type: 'string', short: 'w' },
    },
    strict: false,
    allowPositionals: true,
  });

  const url = (values.url as string | undefined)
    ?? process.env.COZYBASE_URL
    ?? undefined;
  const workspaceDir = resolveWorkspaceDir({ args: Bun.argv.slice(2) });

  return { url, workspaceDir };
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

async function main() {
  const config = loadCozyBaseMcpConfig();
  const daemonUrl = await resolveDaemonUrl(config);
  const context = createRemoteCozyBaseActionContext((path, options) => {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return fetch(`${daemonUrl}${normalizedPath}`, {
      ...options,
      method: options?.method ?? 'GET',
    });
  });

  const server = createCozyBaseMcpServer(context);
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
  console.error('CozyBase MCP server failed to start:', err);
  process.exit(1);
});
