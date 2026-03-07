import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { parseArgs } from 'util';

const desktopRoot = resolve(import.meta.dir, '..');
const defaultBundleRoot = join(desktopRoot, 'src-tauri', 'target', 'release', 'bundle');
const signableBundleExtensions = new Set(['.framework', '.xpc', '.appex']);
const signableBinaryExtensions = new Set(['.dylib', '.so']);

interface CliOptions {
  app?: string;
  bundleRoot: string;
  archive: boolean;
  out?: string;
  help: boolean;
}

function parseCli(): CliOptions {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      app: { type: 'string' },
      bundleRoot: { type: 'string' },
      out: { type: 'string' },
      archive: { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });

  return {
    app: values.app ? resolve(String(values.app)) : undefined,
    bundleRoot: resolve(String(values.bundleRoot ?? defaultBundleRoot)),
    archive: Boolean(values.archive),
    out: values.out ? resolve(String(values.out)) : undefined,
    help: Boolean(values.help),
  };
}

function printHelp() {
  console.log(`Usage:
  bun run scripts/adhoc-sign.ts [--app /path/to/CozyBase.app] [--archive] [--out /path/to/CozyBase.app.tar.gz]

Options:
  --app         Explicit .app bundle to sign. Defaults to the first app found in src-tauri/target/release/bundle/macos.
  --bundleRoot  Override the Tauri bundle root. Default: ${defaultBundleRoot}
  --archive     Create a .app.tar.gz next to the signed app, or at --out if provided.
  --out         Output path for the .app.tar.gz archive. Requires --archive.
  -h, --help    Show this help message.
`);
}

function isExecutableFile(path: string): boolean {
  const stat = statSync(path);
  return stat.isFile() && (stat.mode & 0o111) !== 0;
}

function walk(path: string, visitor: (entryPath: string) => void) {
  visitor(path);
  const stat = statSync(path);
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(path)) {
    walk(join(path, entry), visitor);
  }
}

function findApp(bundleRoot: string): string {
  const macosDir = join(bundleRoot, 'macos');
  if (!existsSync(macosDir)) {
    throw new Error(`Tauri macOS bundle directory not found: ${macosDir}`);
  }

  const apps = readdirSync(macosDir)
    .filter((entry) => entry.endsWith('.app'))
    .sort();

  if (apps.length === 0) {
    throw new Error(`No .app bundle found in ${macosDir}. Run "bun run desktop:build" first.`);
  }

  return join(macosDir, apps[0]);
}

function collectTargets(appPath: string): string[] {
  const targets = new Set<string>();
  walk(appPath, (entryPath) => {
    const ext = extname(entryPath);
    if (signableBundleExtensions.has(ext)) {
      targets.add(entryPath);
      return;
    }

    if (!existsSync(entryPath)) return;
    const stat = statSync(entryPath);
    if (stat.isFile() && (isExecutableFile(entryPath) || signableBinaryExtensions.has(ext))) {
      targets.add(entryPath);
    }
  });

  targets.delete(appPath);
  return Array.from(targets).sort((left, right) => left.length - right.length);
}

function runOrThrow(command: string[], cwd?: string, env?: Record<string, string>) {
  const [cmd, ...args] = command;
  const result = Bun.spawnSync({
    cmd: [cmd, ...args],
    cwd,
    env,
    stdout: 'inherit',
    stderr: 'inherit',
  });

  if (result.exitCode !== 0) {
    throw new Error(`Command failed (${result.exitCode}): ${command.join(' ')}`);
  }
}

function ensureCodesignAvailable() {
  if (!Bun.which('codesign')) {
    throw new Error('codesign is not available on PATH. This script must run on macOS with Xcode Command Line Tools installed.');
  }
}

function signPath(path: string, options: string[] = []) {
  runOrThrow(['codesign', '--force', '--sign', '-', '--timestamp=none', ...options, path]);
}

function archiveApp(appPath: string, outPath?: string) {
  const archivePath = outPath ?? join(dirname(appPath), `${basename(appPath)}.tar.gz`);
  mkdirSync(dirname(archivePath), { recursive: true });
  runOrThrow(
    ['tar', '-czf', archivePath, basename(appPath)],
    dirname(appPath),
    { ...process.env, COPYFILE_DISABLE: '1' } as Record<string, string>,
  );
  console.log(`Created archive: ${archivePath}`);
}

function main() {
  const cli = parseCli();
  if (cli.help) {
    printHelp();
    return;
  }

  if (cli.out && !cli.archive) {
    throw new Error('--out requires --archive.');
  }

  ensureCodesignAvailable();

  const appPath = cli.app ?? findApp(cli.bundleRoot);
  if (!existsSync(appPath)) {
    throw new Error(`App bundle not found: ${appPath}`);
  }

  console.log(`Ad-hoc signing: ${appPath}`);
  for (const target of collectTargets(appPath)) {
    signPath(target);
  }
  signPath(appPath, ['--deep']);

  console.log('Verifying ad-hoc signature...');
  runOrThrow(['codesign', '--verify', '--deep', '--strict', '--verbose=4', appPath]);

  if (cli.archive) {
    archiveApp(appPath, cli.out);
  }
}

main();
