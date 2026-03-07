import { chmodSync, copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';

const desktopRoot = resolve(import.meta.dir, '..');
const binariesDir = join(desktopRoot, 'src-tauri', 'resources', 'binaries');

function resolveTargetTriple(): string {
  const explicit = process.env.COZYBASE_BUN_TARGET?.trim();
  if (explicit) return explicit;

  if (process.platform !== 'darwin') {
    throw new Error('Desktop MVP 仅支持 macOS，请通过 COZYBASE_BUN_TARGET 显式指定 target triple。');
  }

  switch (process.arch) {
    case 'arm64':
      return 'aarch64-apple-darwin';
    case 'x64':
      return 'x86_64-apple-darwin';
    default:
      throw new Error(`Unsupported macOS architecture: ${process.arch}`);
  }
}

function resolveSourceBinary(): string {
  const explicit = process.env.COZYBASE_BUN_SOURCE?.trim();
  if (explicit) {
    return resolve(explicit);
  }

  const discovered = Bun.which('bun') ?? process.execPath;
  return resolve(discovered);
}

function main() {
  const targetTriple = resolveTargetTriple();
  const sourceBinary = resolveSourceBinary();
  const sourceName = basename(sourceBinary);
  const destination = join(binariesDir, `bun-${targetTriple}`);

  if (!existsSync(sourceBinary)) {
    throw new Error(`Bun binary not found: ${sourceBinary}`);
  }

  mkdirSync(binariesDir, { recursive: true });
  copyFileSync(sourceBinary, destination);
  chmodSync(destination, 0o755);

  writeFileSync(
    join(binariesDir, 'bun-sidecar.json'),
    JSON.stringify(
      {
        copiedFrom: sourceBinary,
        copiedAt: new Date().toISOString(),
        sourceName,
        targetTriple,
      },
      null,
      2,
    ),
    'utf-8',
  );

  console.log(`Prepared Bun sidecar at ${destination}`);
}

main();
