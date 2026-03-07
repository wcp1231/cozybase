import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const repoRoot = resolve(import.meta.dir, '..', '..', '..');
const desktopRoot = resolve(import.meta.dir, '..');
const resourceRoot = join(desktopRoot, 'src-tauri', 'resources');
const daemonEntry = join(repoRoot, 'packages', 'daemon', 'src', 'cli.ts');
const daemonOutput = join(resourceRoot, 'daemon.js');
const webDistDir = join(repoRoot, 'packages', 'web', 'dist');
const guidesDir = join(repoRoot, 'packages', 'daemon', 'guides');
const templatesDir = join(repoRoot, 'packages', 'daemon', 'templates');

async function bundleDaemon() {
  const result = await Bun.build({
    entrypoints: [daemonEntry],
    outdir: resourceRoot,
    naming: 'daemon.js',
    target: 'bun',
    sourcemap: 'linked',
    external: ['bun:sqlite'],
    minify: false,
  });

  if (!result.success) {
    const messages = result.logs.map((log) => log.message).join('\n');
    throw new Error(`Failed to bundle daemon:\n${messages}`);
  }
}

function resetDirectory(path: string) {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

function copyTree(from: string, to: string) {
  if (!existsSync(from)) {
    throw new Error(`Required resource path not found: ${from}`);
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

async function main() {
  if (!existsSync(webDistDir)) {
    throw new Error(`Web dist not found at ${webDistDir}. Run "bun run build:web" first.`);
  }

  mkdirSync(resourceRoot, { recursive: true });
  resetDirectory(join(resourceRoot, 'web'));
  resetDirectory(join(resourceRoot, 'templates'));
  resetDirectory(join(resourceRoot, 'guides'));
  mkdirSync(join(resourceRoot, 'binaries'), { recursive: true });
  rmSync(daemonOutput, { force: true });
  rmSync(`${daemonOutput}.map`, { force: true });

  await bundleDaemon();
  copyTree(webDistDir, join(resourceRoot, 'web'));
  copyTree(templatesDir, join(resourceRoot, 'templates'));
  copyTree(guidesDir, join(resourceRoot, 'guides'));

  const sidecarTarget = join(resourceRoot, 'binaries');
  if (existsSync(sidecarTarget)) {
    for (const entry of new Bun.Glob('bun-*').scanSync({ cwd: sidecarTarget, absolute: true })) {
      chmodSync(entry, 0o755);
    }
  }

  console.log(`Desktop resources prepared in ${resourceRoot}`);
}

await main();
