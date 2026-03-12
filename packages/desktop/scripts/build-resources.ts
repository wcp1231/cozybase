import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const repoRoot = resolve(import.meta.dir, '..', '..', '..');
const desktopRoot = resolve(import.meta.dir, '..');
const brandIconSource = join(repoRoot, 'assets', 'brand', 'cozybase-icon.png');
const brandIcnsSource = join(repoRoot, 'assets', 'brand', 'cozybase.icns');
const tauriIconDir = join(desktopRoot, 'src-tauri', 'icons');
const tauriIcnsTarget = join(tauriIconDir, 'icon.icns');
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

async function generateTauriIcons() {
  if (!existsSync(brandIconSource)) {
    throw new Error(`Required brand icon not found: ${brandIconSource}`);
  }

  mkdirSync(tauriIconDir, { recursive: true });

  const proc = Bun.spawn(['bunx', 'tauri', 'icon', brandIconSource, '--output', tauriIconDir], {
    cwd: desktopRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`Failed to generate Tauri icons from ${brandIconSource}`);
  }

  if (existsSync(brandIcnsSource)) {
    cpSync(brandIcnsSource, tauriIcnsTarget);
  }
}

async function main() {
  if (!existsSync(webDistDir)) {
    throw new Error(
      `Web dist not found at ${webDistDir}. Run "bun run desktop:prepare" from the repo root, or build the web bundle before calling the package-local desktop prepare step.`,
    );
  }

  mkdirSync(resourceRoot, { recursive: true });
  resetDirectory(join(resourceRoot, 'web'));
  resetDirectory(join(resourceRoot, 'templates'));
  resetDirectory(join(resourceRoot, 'guides'));
  mkdirSync(join(resourceRoot, 'binaries'), { recursive: true });
  rmSync(daemonOutput, { force: true });
  rmSync(`${daemonOutput}.map`, { force: true });

  await bundleDaemon();
  await generateTauriIcons();
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
