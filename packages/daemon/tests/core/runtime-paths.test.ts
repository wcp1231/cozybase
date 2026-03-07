import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'path';
import {
  resolveAppTemplatesDir,
  resolveBunExecutable,
  resolveDaemonEntryPath,
  resolveGuidesDir,
  resolveWebDistDir,
  resolveWorkspaceDir,
  resolveWorkspaceTemplatesDir,
} from '../../src/runtime-paths';

describe('runtime-paths', () => {
  test('workspace dir prefers CLI args over env', () => {
    const resolved = resolveWorkspaceDir({
      args: ['daemon', '--workspace', './custom-space'],
      env: { COZYBASE_WORKSPACE: '/tmp/ignored' },
    });

    expect(resolved).toBe(resolve(process.cwd(), 'custom-space'));
  });

  test('workspace dir falls back to env', () => {
    const resolved = resolveWorkspaceDir({
      args: ['daemon'],
      env: { COZYBASE_WORKSPACE: '/tmp/cozybase-desktop' },
    });

    expect(resolved).toBe('/tmp/cozybase-desktop');
  });

  test('bun executable falls back to configured sidecar path', () => {
    expect(resolveBunExecutable({ COZYBASE_BUN_PATH: '/Applications/CozyBase.app/Contents/Resources/binaries/bun' }))
      .toBe('/Applications/CozyBase.app/Contents/Resources/binaries/bun');
    expect(resolveBunExecutable({})).toBe('bun');
  });

  test('resource dir drives bundled asset locations', () => {
    const env = { COZYBASE_RESOURCE_DIR: '/bundle/Resources' };

    expect(resolveAppTemplatesDir(env)).toBe('/bundle/Resources/templates/apps');
    expect(resolveWorkspaceTemplatesDir(env)).toBe('/bundle/Resources/templates/workspace');
    expect(resolveGuidesDir(env)).toBe('/bundle/Resources/guides');
    expect(resolveWebDistDir(env)).toBe('/bundle/Resources/web');
  });

  test('daemon entry path can be overridden for bundled runtime', () => {
    expect(resolveDaemonEntryPath({ COZYBASE_DAEMON_ENTRY: '/bundle/Resources/daemon.js' }))
      .toBe('/bundle/Resources/daemon.js');
    expect(resolveDaemonEntryPath({})).toBe(join(resolve(process.cwd(), 'packages/daemon/src'), 'cli.ts'));
  });
});
