import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import { daemonLogger } from '../../src/core/daemon-logger';
import { resolveDaemonLogFilePath } from '../../src/runtime-paths';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

describe('daemonLogger', () => {
  let handle: TestWorkspaceHandle;
  let previousHome: string | undefined;

  afterEach(() => {
    process.env.HOME = previousHome;
    handle?.cleanup();
  });

  test('writes timestamped log lines to the daemon log file', () => {
    handle = createTestWorkspace();
    previousHome = process.env.HOME;
    process.env.HOME = handle.root;
    daemonLogger.configure(handle.workspace.getPlatformRepo());

    daemonLogger.info('hello logger');

    const logPath = resolveDaemonLogFilePath();
    expect(existsSync(logPath)).toBeTrue();
    const content = readFileSync(logPath, 'utf-8');
    expect(content).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(content).toContain('[INFO] hello logger');
  });

  test('filters logs based on the persisted daemon log level and applies updates immediately', () => {
    handle = createTestWorkspace();
    previousHome = process.env.HOME;
    process.env.HOME = handle.root;
    const platformRepo = handle.workspace.getPlatformRepo();
    daemonLogger.configure(platformRepo);

    daemonLogger.debug('skip debug');
    platformRepo.settings.set('daemon.log_level', 'DEBUG');
    daemonLogger.debug('write debug');
    platformRepo.settings.set('daemon.log_level', 'ERROR');
    daemonLogger.warn('skip warning');
    daemonLogger.error('write error');

    const content = readFileSync(resolveDaemonLogFilePath(), 'utf-8');
    expect(content).not.toContain('skip debug');
    expect(content).toContain('[DEBUG] write debug');
    expect(content).not.toContain('skip warning');
    expect(content).toContain('[ERROR] write error');
  });
});
