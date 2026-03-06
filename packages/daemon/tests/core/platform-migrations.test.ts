import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runPlatformMigrations } from '../../src/core/platform-migrations';
import { PlatformRepository } from '../../src/core/platform-repository';

function createMigratedDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runPlatformMigrations(db);
  return db;
}

describe('Platform migrations', () => {
  test('creates schedule_runs table and indexes', () => {
    const db = createMigratedDb();

    const table = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schedule_runs'")
      .get() as { name: string } | null;
    expect(table?.name).toBe('schedule_runs');

    const columns = db.query('PRAGMA table_info(schedule_runs)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('app_slug');
    expect(columnNames).toContain('schedule_name');
    expect(columnNames).toContain('runtime_mode');
    expect(columnNames).toContain('trigger_mode');
    expect(columnNames).toContain('status');
    expect(columnNames).toContain('started_at');
    expect(columnNames).toContain('finished_at');
    expect(columnNames).toContain('duration_ms');
    expect(columnNames).toContain('error_message');

    const indexes = db.query("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[];
    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toContain('idx_schedule_runs_app_schedule_started');
    expect(indexNames).toContain('idx_schedule_runs_status');

    db.close();
  });

  test('is idempotent when run multiple times', () => {
    const db = createMigratedDb();
    runPlatformMigrations(db);

    const rows = db.query('SELECT version FROM _platform_migrations ORDER BY version').all() as { version: number }[];
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);

    db.close();
  });
});

describe('ScheduleRunsRepository', () => {
  test('creates, updates, queries, and prunes schedule runs', () => {
    const db = createMigratedDb();
    const repo = new PlatformRepository(db);

    repo.apps.create({
      slug: 'myapp',
      description: 'test app',
      currentVersion: 1,
      publishedVersion: 1,
      stableStatus: 'running',
    });

    const runId = repo.scheduleRuns.create({
      appSlug: 'myapp',
      scheduleName: 'daily-report',
      runtimeMode: 'stable',
      triggerMode: 'auto',
      status: 'running',
      functionRef: 'report:run',
    });

    const created = repo.scheduleRuns.findById(runId);
    expect(created).not.toBeNull();
    expect(created?.status).toBe('running');

    repo.scheduleRuns.updateStatus(runId, {
      status: 'success',
      durationMs: 1200,
    });

    const updated = repo.scheduleRuns.findById(runId);
    expect(updated?.status).toBe('success');
    expect(updated?.duration_ms).toBe(1200);
    expect(typeof updated?.finished_at).toBe('string');

    for (let i = 0; i < 120; i += 1) {
      repo.scheduleRuns.create({
        appSlug: 'myapp',
        scheduleName: 'daily-report',
        runtimeMode: 'stable',
        triggerMode: 'auto',
        status: 'success',
        functionRef: 'report:run',
      });
    }

    repo.scheduleRuns.pruneToRecent('myapp', 'daily-report', 100);
    const recent = repo.scheduleRuns.findByAppAndSchedule('myapp', 'daily-report', 200);
    expect(recent.length).toBe(100);

    db.close();
  });

  test('deletes schedule runs when app is deleted (FK cascade)', () => {
    const db = createMigratedDb();
    const repo = new PlatformRepository(db);

    repo.apps.create({
      slug: 'myapp',
      description: 'test app',
      currentVersion: 1,
      publishedVersion: 1,
      stableStatus: 'running',
    });
    repo.scheduleRuns.create({
      appSlug: 'myapp',
      scheduleName: 'daily-report',
      runtimeMode: 'stable',
      triggerMode: 'manual',
      status: 'success',
      functionRef: 'report:run',
    });

    repo.apps.delete('myapp');

    const count = db.query('SELECT COUNT(*) as cnt FROM schedule_runs').get() as { cnt: number };
    expect(count.cnt).toBe(0);

    db.close();
  });
});
