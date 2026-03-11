import { homedir } from 'os';
import { join, resolve } from 'path';
import { parseArgs } from 'util';

interface ResolveOptions {
  args?: string[];
  env?: NodeJS.ProcessEnv;
}

export function resolveWorkspaceDir(options: ResolveOptions = {}): string {
  const args = options.args ?? Bun.argv.slice(2);
  const env = options.env ?? process.env;
  const { values } = parseArgs({
    args,
    options: {
      workspace: { type: 'string', short: 'w' },
    },
    strict: false,
    allowPositionals: true,
  });

  return resolve(
    (values.workspace as string | undefined)
      ?? env.COZYBASE_WORKSPACE
      ?? join(homedir(), '.cozybase'),
  );
}

export function resolveBunExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COZYBASE_BUN_PATH?.trim();
  return configured && configured.length > 0 ? configured : 'bun';
}

export function resolveResourceDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.COZYBASE_RESOURCE_DIR?.trim();
  return configured && configured.length > 0 ? resolve(configured) : null;
}

export function resolveTemplatesRootDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COZYBASE_TEMPLATES_DIR?.trim();
  if (configured && configured.length > 0) {
    return resolve(configured);
  }

  const resourceDir = resolveResourceDir(env);
  if (resourceDir) {
    return join(resourceDir, 'templates');
  }

  return resolve(import.meta.dir, '..', 'templates');
}

export function resolveAppTemplatesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveTemplatesRootDir(env), 'apps');
}

export function resolveWorkspaceTemplatesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveTemplatesRootDir(env), 'workspace');
}

export function resolveOpenClawTemplatesDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveTemplatesRootDir(env), 'openclaw');
}

export function resolveGuidesDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COZYBASE_GUIDES_DIR?.trim();
  if (configured && configured.length > 0) {
    return resolve(configured);
  }

  const resourceDir = resolveResourceDir(env);
  if (resourceDir) {
    return join(resourceDir, 'guides');
  }

  return resolve(import.meta.dir, '..', 'guides');
}

export function resolveWebDistDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COZYBASE_WEB_DIST_DIR?.trim();
  if (configured && configured.length > 0) {
    return resolve(configured);
  }

  const resourceDir = resolveResourceDir(env);
  if (resourceDir) {
    return join(resourceDir, 'web');
  }

  return resolve(import.meta.dir, '..', '..', 'web', 'dist');
}

export function resolveDaemonEntryPath(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COZYBASE_DAEMON_ENTRY?.trim();
  if (configured && configured.length > 0) {
    return resolve(configured);
  }

  return resolve(import.meta.dir, 'cli.ts');
}
