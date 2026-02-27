import { resolve, join } from 'path';
import { homedir } from 'os';
import { parseArgs } from 'util';

export interface Config {
  port: number;
  host: string;
  workspaceDir: string;
  jwtSecret: string;
}

export function loadConfig(): Config {
  // Parse CLI arguments: --workspace, --port
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      workspace: { type: 'string', short: 'w' },
      port: { type: 'string', short: 'p' },
    },
    strict: false,
    allowPositionals: true,
  });

  const workspaceDir = resolve(
    values.workspace as string
    ?? process.env.COZYBASE_WORKSPACE
    ?? join(homedir(), '.cozybase'),
  );

  return {
    port: Number(values.port ?? process.env.COZYBASE_PORT ?? 3000),
    host: process.env.COZYBASE_HOST ?? '0.0.0.0',
    workspaceDir,
    jwtSecret: process.env.COZYBASE_JWT_SECRET ?? 'cozybase-dev-secret-change-me',
  };
}
