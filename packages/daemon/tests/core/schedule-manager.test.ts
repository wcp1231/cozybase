import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createRuntime } from '@cozybase/runtime';
import { ScheduleManager } from '../../src/core/schedule-manager';
import {
  createTestApp,
  createTestWorkspace,
  setAppSpec,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';

describe('ScheduleManager', () => {
  let handle: TestWorkspaceHandle | undefined;
  let runtime: ReturnType<typeof createRuntime> | undefined;

  afterEach(() => {
    runtime?.registry.shutdownAll();
    handle?.cleanup();
    runtime = undefined;
    handle = undefined;
  });

  test('loads, reloads, and unloads enabled schedules', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'enabled-job', cron: '*/5 * * * *', function: 'jobs:run', enabled: true },
          { name: 'disabled-job', cron: '*/5 * * * *', function: 'jobs:run', enabled: false },
        ],
      },
    });

    runtime = createRuntime();
    const manager = new ScheduleManager({
      platformRepo: handle.workspace.getPlatformRepo(),
      registry: runtime.registry,
      stablePlatformClient: runtime.stablePlatformClient,
      draftPlatformClient: runtime.draftPlatformClient,
    });

    await manager.loadApp('myapp');
    expect(manager.getLoadedScheduleNames('myapp')).toEqual(['enabled-job']);

    setAppSpec(handle, 'myapp', {
      description: 'test',
      stable_status: 'running',
      schedules: [
        { name: 'reloaded-job', cron: '*/10 * * * *', function: 'jobs:run', enabled: true },
      ],
    });

    await manager.reloadApp('myapp');
    expect(manager.getLoadedScheduleNames('myapp')).toEqual(['reloaded-job']);

    manager.unloadApp('myapp');
    expect(manager.getLoadedScheduleNames('myapp')).toEqual([]);
  });

  test('manual trigger executes handler and records run', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'manual-job', cron: '*/5 * * * *', function: 'jobs:run', concurrency: 'skip' },
        ],
      },
    });

    runtime = createRuntime();
    const stableDir = join(handle.root, 'stable', 'myapp');
    const functionsDir = join(stableDir, 'functions');
    const uiDir = join(stableDir, 'ui');
    mkdirSync(functionsDir, { recursive: true });
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'pages.json'), '{"pages":[]}', 'utf-8');
    writeFileSync(join(functionsDir, 'jobs.ts'), `
export async function run() {
  return { ok: true, source: 'manual' };
}
`, 'utf-8');

    runtime.registry.start('myapp', {
      mode: 'stable',
      dbPath: join(stableDir, 'db.sqlite'),
      functionsDir,
      uiDir,
    });

    const manager = new ScheduleManager({
      platformRepo: handle.workspace.getPlatformRepo(),
      registry: runtime.registry,
      stablePlatformClient: runtime.stablePlatformClient,
      draftPlatformClient: runtime.draftPlatformClient,
    });

    const result = await manager.triggerManual('myapp', 'manual-job', 'stable');
    expect(result.status).toBe('success');
    expect(result.result).toEqual({ ok: true, source: 'manual' });

    const runs = handle.workspace
      .getPlatformRepo()
      .scheduleRuns
      .findByAppAndSchedule('myapp', 'manual-job', 10);
    expect(runs).toHaveLength(1);
    expect(runs[0]?.status).toBe('success');
  });

  test('skip strategy marks overlapping execution as skipped', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'slow-job', cron: '*/5 * * * *', function: 'jobs:run', concurrency: 'skip', timeout: 5000 },
        ],
      },
    });

    runtime = createRuntime();
    const stableDir = join(handle.root, 'stable', 'myapp');
    const functionsDir = join(stableDir, 'functions');
    const uiDir = join(stableDir, 'ui');
    mkdirSync(functionsDir, { recursive: true });
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'pages.json'), '{"pages":[]}', 'utf-8');
    writeFileSync(join(functionsDir, 'jobs.ts'), `
export async function run() {
  await Bun.sleep(120);
  return { ok: true };
}
`, 'utf-8');

    runtime.registry.start('myapp', {
      mode: 'stable',
      dbPath: join(stableDir, 'db.sqlite'),
      functionsDir,
      uiDir,
    });

    const manager = new ScheduleManager({
      platformRepo: handle.workspace.getPlatformRepo(),
      registry: runtime.registry,
      stablePlatformClient: runtime.stablePlatformClient,
      draftPlatformClient: runtime.draftPlatformClient,
    });

    const p1 = manager.triggerManual('myapp', 'slow-job', 'stable');
    await Bun.sleep(10);
    const p2 = manager.triggerManual('myapp', 'slow-job', 'stable');

    const [r1, r2] = await Promise.all([p1, p2]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual(['skipped', 'success']);
  });

  test('queue strategy keeps a single queued execution and skips overflow', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'queued-job', cron: '*/5 * * * *', function: 'jobs:run', concurrency: 'queue', timeout: 5000 },
        ],
      },
    });

    runtime = createRuntime();
    const stableDir = join(handle.root, 'stable', 'myapp');
    const functionsDir = join(stableDir, 'functions');
    const uiDir = join(stableDir, 'ui');
    mkdirSync(functionsDir, { recursive: true });
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'pages.json'), '{"pages":[]}', 'utf-8');
    writeFileSync(join(functionsDir, 'jobs.ts'), `
let calls = 0;
export async function run() {
  calls += 1;
  await Bun.sleep(80);
  return { calls };
}
`, 'utf-8');

    runtime.registry.start('myapp', {
      mode: 'stable',
      dbPath: join(stableDir, 'db.sqlite'),
      functionsDir,
      uiDir,
    });

    const manager = new ScheduleManager({
      platformRepo: handle.workspace.getPlatformRepo(),
      registry: runtime.registry,
      stablePlatformClient: runtime.stablePlatformClient,
      draftPlatformClient: runtime.draftPlatformClient,
    });

    const p1 = manager.triggerManual('myapp', 'queued-job', 'stable');
    await Bun.sleep(10);
    const p2 = manager.triggerManual('myapp', 'queued-job', 'stable');
    await Bun.sleep(10);
    const p3 = manager.triggerManual('myapp', 'queued-job', 'stable');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    const statuses = [r1.status, r2.status, r3.status].sort();
    expect(statuses).toEqual(['skipped', 'success', 'success']);
  });

  test('marks execution as timeout when exceeding configured timeout', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      spec: {
        description: 'test',
        stable_status: 'running',
        schedules: [
          { name: 'timeout-job', cron: '*/5 * * * *', function: 'jobs:run', timeout: 20 },
        ],
      },
    });

    runtime = createRuntime();
    const stableDir = join(handle.root, 'stable', 'myapp');
    const functionsDir = join(stableDir, 'functions');
    const uiDir = join(stableDir, 'ui');
    mkdirSync(functionsDir, { recursive: true });
    mkdirSync(uiDir, { recursive: true });
    writeFileSync(join(uiDir, 'pages.json'), '{"pages":[]}', 'utf-8');
    writeFileSync(join(functionsDir, 'jobs.ts'), `
export async function run() {
  await Bun.sleep(120);
  return { ok: true };
}
`, 'utf-8');

    runtime.registry.start('myapp', {
      mode: 'stable',
      dbPath: join(stableDir, 'db.sqlite'),
      functionsDir,
      uiDir,
    });

    const manager = new ScheduleManager({
      platformRepo: handle.workspace.getPlatformRepo(),
      registry: runtime.registry,
      stablePlatformClient: runtime.stablePlatformClient,
      draftPlatformClient: runtime.draftPlatformClient,
    });

    const result = await manager.triggerManual('myapp', 'timeout-job', 'stable');
    expect(result.status).toBe('timeout');
    expect(result.errorMessage).toContain('timed out');
  });
});
