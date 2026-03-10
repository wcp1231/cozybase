import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveAcpDaemonUrl } from '../../src/acp/acp-entry';

describe('resolveAcpDaemonUrl', () => {
  const createdDirs: string[] = [];

  afterEach(() => {
    while (createdDirs.length > 0) {
      const dir = createdDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  test('prefers an explicit URL and trims trailing slashes', () => {
    expect(resolveAcpDaemonUrl({
      workspaceDir: '/tmp/workspace',
      url: 'http://127.0.0.1:3000/',
    })).toBe('http://127.0.0.1:3000');
  });

  test('discovers a local daemon from the workspace pid files', () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'cozybase-acp-'));
    createdDirs.push(workspaceDir);
    mkdirSync(workspaceDir, { recursive: true });
    writeFileSync(join(workspaceDir, 'daemon.pid'), `${process.pid}\n`, 'utf-8');
    writeFileSync(join(workspaceDir, 'daemon.port'), '4319\n', 'utf-8');

    expect(resolveAcpDaemonUrl({ workspaceDir })).toBe('http://127.0.0.1:4319');
  });

  test('throws when no daemon is running and no URL is provided', () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), 'cozybase-acp-'));
    createdDirs.push(workspaceDir);

    expect(() => resolveAcpDaemonUrl({ workspaceDir })).toThrow(
      'No running cozybase daemon detected. Start the daemon or pass --url http://host:port.',
    );
  });
});
