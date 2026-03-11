import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { AppErrorRecorder } from '../../src/core/app-error-recorder';
import { PLATFORM_MIGRATIONS, runPlatformMigrations } from '../../src/core/platform-migrations';
import { PlatformRepository } from '../../src/core/platform-repository';

function createMigratedDb(): Database {
  const db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  runPlatformMigrations(db);
  return db;
}

describe('Platform migrations', () => {
  test('creates app_error_logs table and indexes', () => {
    const db = createMigratedDb();

    const table = db
      .query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_error_logs'")
      .get() as { name: string } | null;
    expect(table?.name).toBe('app_error_logs');

    const columns = db.query('PRAGMA table_info(app_error_logs)').all() as { name: string }[];
    const columnNames = columns.map((c) => c.name);
    expect(columnNames).toContain('app_slug');
    expect(columnNames).toContain('runtime_mode');
    expect(columnNames).toContain('source_type');
    expect(columnNames).toContain('source_detail');
    expect(columnNames).toContain('error_code');
    expect(columnNames).toContain('error_message');
    expect(columnNames).toContain('stack_trace');
    expect(columnNames).toContain('occurrence_count');
    expect(columnNames).toContain('created_at');
    expect(columnNames).toContain('updated_at');

    const indexes = db.query("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[];
    const indexNames = indexes.map((idx) => idx.name);
    expect(indexNames).toContain('idx_app_error_logs_app_mode_updated');
    expect(indexNames).toContain('idx_app_error_logs_app_mode_created');
    expect(indexNames).toContain('idx_app_error_logs_source');

    db.close();
  });

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
    expect(rows.map((r) => r.version)).toEqual(PLATFORM_MIGRATIONS.map((migration) => migration.version));

    db.close();
  });
});

describe('AppErrorRecorder', () => {
  test('deduplicates repeated errors and increments occurrence count', () => {
    const db = createMigratedDb();
    const repo = new PlatformRepository(db);
    repo.apps.create({ slug: 'myapp' });
    const recorder = new AppErrorRecorder(repo);

    recorder.record({
      appSlug: 'myapp',
      runtimeMode: 'draft',
      sourceType: 'http_function',
      sourceDetail: 'GET /draft/apps/myapp/fn/broken',
      errorCode: 'FUNCTION_ERROR',
      errorMessage: 'boom',
      stackTrace: 'stack-a',
    });
    recorder.record({
      appSlug: 'myapp',
      runtimeMode: 'draft',
      sourceType: 'http_function',
      sourceDetail: 'GET /draft/apps/myapp/fn/broken',
      errorCode: 'FUNCTION_ERROR',
      errorMessage: 'boom',
      stackTrace: 'stack-b',
    });

    const rows = repo.appErrorLogs.listByAppAndMode('myapp', 'draft', { limit: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.occurrence_count).toBe(2);

    db.close();
  });

  test('rate limits only new rows and keeps deduplicated updates flowing', () => {
    const db = createMigratedDb();
    const repo = new PlatformRepository(db);
    repo.apps.create({ slug: 'myapp' });
    const recorder = new AppErrorRecorder(repo, {
      limitPerMinute: 2,
      now: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    expect(recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'stable',
      sourceType: 'build',
      sourceDetail: 'stable-publish',
      errorCode: 'ERR_A',
      errorMessage: 'first',
    }).status).toBe('inserted');
    expect(recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'stable',
      sourceType: 'build',
      sourceDetail: 'stable-publish',
      errorCode: 'ERR_B',
      errorMessage: 'second',
    }).status).toBe('inserted');
    expect(recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'stable',
      sourceType: 'build',
      sourceDetail: 'stable-publish',
      errorCode: 'ERR_C',
      errorMessage: 'third',
    }).status).toBe('rate_limited');
    expect(recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'stable',
      sourceType: 'build',
      sourceDetail: 'stable-publish',
      errorCode: 'ERR_A',
      errorMessage: 'first',
    }).status).toBe('deduplicated');

    const rows = repo.appErrorLogs.listByAppAndMode('myapp', 'stable', { limit: 10 });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.error_message === 'first')?.occurrence_count).toBe(2);

    db.close();
  });

  test('prunes older rows and clears draft logs independently', () => {
    const db = createMigratedDb();
    const repo = new PlatformRepository(db);
    repo.apps.create({ slug: 'myapp' });
    const recorder = new AppErrorRecorder(repo, {
      keepPerAppMode: 2,
      now: () => new Date('2026-03-06T12:00:00.000Z'),
    });

    recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'draft',
      sourceType: 'build',
      sourceDetail: 'draft-reconcile',
      errorCode: 'ONE',
      errorMessage: 'one',
    });
    recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'draft',
      sourceType: 'build',
      sourceDetail: 'draft-reconcile',
      errorCode: 'TWO',
      errorMessage: 'two',
    });
    recorder.recordDetailed({
      appSlug: 'myapp',
      runtimeMode: 'draft',
      sourceType: 'build',
      sourceDetail: 'draft-reconcile',
      errorCode: 'THREE',
      errorMessage: 'three',
    });
    recorder.record({
      appSlug: 'myapp',
      runtimeMode: 'stable',
      sourceType: 'build',
      sourceDetail: 'stable-publish',
      errorCode: 'STABLE',
      errorMessage: 'stable-only',
    });

    expect(repo.appErrorLogs.listByAppAndMode('myapp', 'draft', { limit: 10 })).toHaveLength(2);
    recorder.clearDraftErrors('myapp');
    expect(repo.appErrorLogs.listByAppAndMode('myapp', 'draft', { limit: 10 })).toHaveLength(0);
    expect(repo.appErrorLogs.listByAppAndMode('myapp', 'stable', { limit: 10 })).toHaveLength(1);

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
