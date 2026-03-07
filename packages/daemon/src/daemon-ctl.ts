import { join } from 'path';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { resolveWorkspaceDir } from './runtime-paths';

/**
 * Resolve workspace dir from CLI args or env, matching config.ts logic.
 */
export function getWorkspaceDir(): string {
  return resolveWorkspaceDir({ args: Bun.argv.slice(2) });
}

function pidFilePath(workspaceDir: string): string {
  return join(workspaceDir, 'daemon.pid');
}

function portFilePath(workspaceDir: string): string {
  return join(workspaceDir, 'daemon.port');
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readPidFile(workspaceDir: string): { pid: number; port: number } | null {
  const pidPath = pidFilePath(workspaceDir);
  if (!existsSync(pidPath)) return null;

  const pid = parseInt(readFileSync(pidPath, 'utf-8').trim(), 10);
  if (isNaN(pid)) return null;

  const portPath = portFilePath(workspaceDir);
  let port = 0;
  if (existsSync(portPath)) {
    port = parseInt(readFileSync(portPath, 'utf-8').trim(), 10);
    if (isNaN(port)) port = 0;
  }

  return { pid, port };
}

export function writePidFile(workspaceDir: string, pid: number, port: number): void {
  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(pidFilePath(workspaceDir), String(pid), 'utf-8');
  writeFileSync(portFilePath(workspaceDir), String(port), 'utf-8');
}

export function cleanupPidFile(workspaceDir: string): void {
  try { unlinkSync(pidFilePath(workspaceDir)); } catch {}
  try { unlinkSync(portFilePath(workspaceDir)); } catch {}
}

export function daemonStatus(): void {
  const workspaceDir = getWorkspaceDir();
  const info = readPidFile(workspaceDir);

  if (!info || !isProcessAlive(info.pid)) {
    if (info) cleanupPidFile(workspaceDir);
    console.log('cozybase daemon is not running');
    process.exit(1);
  }

  console.log(`cozybase daemon is running
  PID:       ${info.pid}
  Port:      ${info.port}
  Workspace: ${workspaceDir}`);
}

export async function stopDaemon(): Promise<boolean> {
  const workspaceDir = getWorkspaceDir();
  const info = readPidFile(workspaceDir);

  if (!info || !isProcessAlive(info.pid)) {
    if (info) cleanupPidFile(workspaceDir);
    console.log('cozybase daemon is not running');
    process.exit(1);
  }

  console.log(`Stopping cozybase daemon (PID: ${info.pid})...`);
  process.kill(info.pid, 'SIGTERM');

  // Wait up to 5 seconds for the process to die
  for (let i = 0; i < 50; i++) {
    await Bun.sleep(100);
    if (!isProcessAlive(info.pid)) {
      cleanupPidFile(workspaceDir);
      console.log('cozybase daemon stopped');
      return true;
    }
  }

  // Force kill if still alive
  try { process.kill(info.pid, 'SIGKILL'); } catch {}
  cleanupPidFile(workspaceDir);
  console.log('cozybase daemon stopped (forced)');
  return true;
}
