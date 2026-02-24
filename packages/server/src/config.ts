import { resolve } from 'path';
import { parseArgs } from 'util';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  workspaceDir: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  // Parse CLI arguments: --workspace, --port, --data
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      workspace: { type: 'string', short: 'w' },
      port: { type: 'string', short: 'p' },
      data: { type: 'string', short: 'd' },
    },
    strict: false,
    allowPositionals: true,
  });

  const workspaceDir = resolve(
    values.workspace as string
    ?? process.env.COZYBASE_WORKSPACE
    ?? '.',
  );

  return {
    port: Number(values.port ?? process.env.COZYBASE_PORT ?? 3000),
    host: process.env.COZYBASE_HOST ?? '0.0.0.0',
    dataDir: resolve(values.data as string ?? process.env.COZYBASE_DATA_DIR ?? './data'),
    workspaceDir,
    jwtSecret: process.env.COZYBASE_JWT_SECRET ?? 'cozybase-dev-secret-change-me',
  };
}
