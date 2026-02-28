import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync } from 'fs';
import { join } from 'path';
import {
  createTestWorkspace,
  createTestApp,
  addMigration,
  createStableDb,
  setAppSpec,
  MIGRATION_CREATE_TODOS,
  MIGRATION_ADD_PRIORITY,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('Workspace', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  // --- init and load ---

  describe('init and load', () => {
    test('createTestWorkspace creates proper directory structure', () => {
      handle = createTestWorkspace();
      const { root } = handle;

      expect(existsSync(join(root, 'stable'))).toBe(true);
      expect(existsSync(join(root, 'draft'))).toBe(true);
      expect(existsSync(join(root, 'workspace.yaml'))).toBe(true);
    });

    test('load parses workspace config and initializes platform DB', () => {
      handle = createTestWorkspace();
      const { workspace } = handle;

      expect(workspace.config.name).toBe('cozybase');
      expect(workspace.config.version).toBe(1);

      const platformDb = workspace.getPlatformDb();
      expect(platformDb).toBeDefined();

      // Platform tables should exist
      const tables = platformDb.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('apps');
      expect(tableNames).toContain('platform_users');
      expect(tableNames).toContain('api_keys');
      expect(tableNames).toContain('app_files');
    });
  });

  // --- scanApps ---

  describe('scanApps', () => {
    test('discovers app from DB', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const apps = handle.workspace.scanApps();

      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('myapp');
      expect(apps[0].current_version).toBe(1);
      expect(apps[0].published_version).toBe(0);
    });

    test('discovers app with description', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_data.sql': "INSERT INTO todos (id, title) VALUES (1, 'test');" },
      });

      const apps = handle.workspace.scanApps();

      expect(apps[0].description).toBe('Test app: myapp');
    });

    test('returns empty when no apps exist', () => {
      handle = createTestWorkspace();

      const apps = handle.workspace.scanApps();
      expect(apps).toHaveLength(0);
    });
  });

  // --- getAppState ---

  describe('getAppState', () => {
    test('returns null stableStatus with draft for new app', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toEqual({ stableStatus: null, hasDraft: true });
    });

    test('returns running stable state when published_version = current_version', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toEqual({ stableStatus: 'running', hasDraft: false });
    });

    test('returns running stable state with draft when current_version > published_version', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

      // Add new migration — increments current_version
      addMigration(handle, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toEqual({ stableStatus: 'running', hasDraft: true });
    });

    test('returns stopped stable state when stable_status is stopped', () => {
      handle = createTestWorkspace();
      createTestApp(handle, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);
      handle.workspace.getPlatformDb().query(
        "UPDATE apps SET stable_status = 'stopped' WHERE name = ?",
      ).run('myapp');

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toEqual({ stableStatus: 'stopped', hasDraft: false });
    });

    test('returns undefined for non-existent app', () => {
      handle = createTestWorkspace();

      const state = handle.workspace.getAppState('nonexistent');
      expect(state).toBeUndefined();
    });
  });
});
