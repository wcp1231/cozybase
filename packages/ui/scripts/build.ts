import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const packageRoot = resolve(import.meta.dir, '..');
const distDir = join(packageRoot, 'dist');
const stylesDir = join(packageRoot, 'src', 'styles');
const bunBinary = Bun.which('bun') ?? process.execPath;

function syncStyles() {
  if (!existsSync(stylesDir)) return;

  const distStylesDir = join(distDir, 'styles');
  rmSync(distStylesDir, { recursive: true, force: true });
  mkdirSync(distDir, { recursive: true });
  cpSync(stylesDir, distStylesDir, { recursive: true });
}

function runBuild(args: string[]) {
  const result = Bun.spawnSync({
    cmd: [bunBinary, ...args],
    cwd: packageRoot,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error(`UI build failed with exit code ${result.exitCode}`);
  }
}

runBuild([
  'build',
  'src/index.ts',
  '--outdir',
  'dist',
  '--format',
  'esm',
  '--splitting',
  '--external',
  'react',
  '--external',
  'react-dom',
  '--production',
]);

syncStyles();
