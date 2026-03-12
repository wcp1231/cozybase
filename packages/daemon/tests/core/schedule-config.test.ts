import { describe, expect, test } from 'bun:test';
import { parseSchedulesFromAppYaml, parseFunctionReference, loadSchedulesFromAppConfig } from '../../src/core/schedule-config';
import { PlatformRepository } from '../../src/core/platform-repository';
import { runPlatformMigrations } from '../../src/core/platform-migrations';
import { Database } from 'bun:sqlite';

describe('schedule-config', () => {
  test('parses valid schedules and applies defaults', () => {
    const result = parseSchedulesFromAppYaml(`
description: test
schedules:
  - name: daily-scrape
    cron: "0 9 * * *"
    function: scrape:fetchAll
  - name: cleanup
    cron: "0 * * * *"
    function: cleanup
    enabled: false
    concurrency: parallel
    timezone: Asia/Shanghai
    timeout: 45000
`);

    expect(result.warnings).toEqual([]);
    expect(result.schedules).toHaveLength(2);

    const first = result.schedules[0]!;
    expect(first.name).toBe('daily-scrape');
    expect(first.functionRef.fileName).toBe('scrape');
    expect(first.functionRef.exportName).toBe('fetchAll');
    expect(first.enabled).toBe(true);
    expect(first.concurrency).toBe('skip');
    expect(first.timezone).toBe('UTC');
    expect(first.timeout).toBe(30000);

    const second = result.schedules[1]!;
    expect(second.functionRef.fileName).toBe('cleanup');
    expect(second.functionRef.exportName).toBe('default');
    expect(second.enabled).toBe(false);
    expect(second.concurrency).toBe('parallel');
    expect(second.timezone).toBe('Asia/Shanghai');
    expect(second.timeout).toBe(45000);
  });

  test('skips invalid schedules and keeps valid ones', () => {
    const result = parseSchedulesFromAppYaml(`
schedules:
  - name: ok
    cron: "*/5 * * * *"
    function: jobs:run
  - name: bad-cron
    cron: "not a cron"
    function: jobs:run
  - name: bad-fn
    cron: "0 1 * * *"
    function: "foo:invalid-name!"
  - cron: "0 1 * * *"
    function: jobs:run
  - name: ok
    cron: "0 1 * * *"
    function: jobs:runAgain
`);

    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0]?.name).toBe('ok');
    expect(result.warnings.length).toBeGreaterThanOrEqual(4);
  });

  test('returns warning when schedules is not an array', () => {
    const result = parseSchedulesFromAppYaml(`
schedules:
  name: invalid
`);

    expect(result.schedules).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('must be an array');
  });

  test('loads app.yaml from platform repository', () => {
    const db = new Database(':memory:');
    db.run('PRAGMA foreign_keys = ON');
    runPlatformMigrations(db);
    const repo = new PlatformRepository(db);

    repo.apps.create({
      slug: 'demo',
      description: 'demo app',
      currentVersion: 1,
      publishedVersion: 1,
      stableStatus: 'running',
    });
    repo.appFiles.create('demo', 'app.yaml', `
description: demo
schedules:
  - name: heartbeat
    cron: "*/15 * * * *"
    function: heartbeat:run
`);

    const result = loadSchedulesFromAppConfig(repo, 'demo');
    expect(result.warnings).toEqual([]);
    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0]?.name).toBe('heartbeat');

    db.close();
  });
});

describe('parseFunctionReference', () => {
  test('parses file and named export', () => {
    const parsed = parseFunctionReference('jobs:run');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.fileName).toBe('jobs');
      expect(parsed.value.exportName).toBe('run');
    }
  });

  test('uses default export when export name is omitted', () => {
    const parsed = parseFunctionReference('cleanup');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.fileName).toBe('cleanup');
      expect(parsed.value.exportName).toBe('default');
    }
  });

  test('rejects malformed references', () => {
    expect(parseFunctionReference('')).toEqual({
      ok: false,
      error: 'function reference cannot be empty',
    });

    const withExtraColon = parseFunctionReference('a:b:c');
    expect(withExtraColon.ok).toBe(false);

    const badFile = parseFunctionReference('bad/file:run');
    expect(badFile.ok).toBe(false);
  });
});
