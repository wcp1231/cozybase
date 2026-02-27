import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import { Verifier } from '../../src/core/verifier';
import {
  createTestWorkspace,
  createTestApp,
  addMigration,
  modifyMigration,
  createStableDb,
  setAppSpec,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
  MIGRATION_BAD_SQL,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('Verifier', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('passes when new migration can be applied to stable copy', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    // Add new migration (not published)
    addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    const result = verifier.verify('myapp');

    expect(result.success).toBe(true);
    expect(result.migrationsToApply).toEqual(['002_add_col.sql']);
    expect(result.detail).toContain('002_add_col.sql');
  });

  test('detects tampered migration (immutable flag cleared)', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    // Modify a published migration (clears immutable flag in test helper)
    modifyMigration(handle, 'myapp', '001_init.sql', 'CREATE TABLE changed (id INTEGER PRIMARY KEY);');
    // Also add a new migration so state becomes stable_draft
    addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    const result = verifier.verify('myapp');

    expect(result.success).toBe(false);
    expect(result.error).toContain('immutable');
    expect(result.error).toContain('001_init.sql');
  });

  test('cleans up temp database file after verification', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    verifier.verify('myapp');

    // Temp file should be cleaned up
    const appContext = handle.workspace.getOrCreateApp('myapp')!;
    const tempPath = join(appContext.draftDataDir, 'verify_temp.sqlite');
    expect(existsSync(tempPath)).toBe(false);
  });

  test('throws BadRequestError for draft_only app', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    expect(() => verifier.verify('myapp')).toThrow(/no stable version/);
  });

  test('throws BadRequestError for stable app with no draft changes', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    expect(() => verifier.verify('myapp')).toThrow(/no draft changes/);
  });

  test('returns failure when pending migration SQL is invalid', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    addMigration(handle, 'myapp', '002_bad.sql', MIGRATION_BAD_SQL);
    handle.workspace.refreshAppState('myapp');

    const verifier = new Verifier(handle.workspace);
    const result = verifier.verify('myapp');

    expect(result.success).toBe(false);
    expect(result.error).toContain('002_bad.sql');
  });

  test('reports no new migrations when all are already executed', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    // Update app spec to trigger stable_draft state
    setAppSpec(handle, 'myapp', { description: 'updated description' });
    handle.workspace.refreshAppState('myapp');
    expect(handle.workspace.getAppState('myapp')).toBe('stable_draft');

    const verifier = new Verifier(handle.workspace);
    const result = verifier.verify('myapp');

    expect(result.success).toBe(true);
    expect(result.migrationsToApply).toEqual([]);
    expect(result.detail).toContain('No new migrations');
  });
});
