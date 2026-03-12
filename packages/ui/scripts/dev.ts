import { cpSync, existsSync, mkdirSync, rmSync, watch } from 'fs';
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

syncStyles();

const buildProcess = Bun.spawn({
  cmd: [
    bunBinary,
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
    '--watch',
  ],
  cwd: packageRoot,
  stdout: 'inherit',
  stderr: 'inherit',
});

const styleWatcher = watch(stylesDir, { recursive: true }, () => {
  syncStyles();
});

async function shutdown(code: number) {
  styleWatcher.close();
  buildProcess.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => {
  void shutdown(130);
});

process.on('SIGTERM', () => {
  void shutdown(143);
});

const exitCode = await buildProcess.exited;
styleWatcher.close();

if (exitCode !== 0) {
  throw new Error(`UI watch build failed with exit code ${exitCode}`);
}
