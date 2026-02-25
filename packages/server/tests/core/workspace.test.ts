import { describe, test, expect, afterEach } from 'bun:test';
import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Workspace } from '../../src/core/workspace';
import {
  createTestWorkspace,
  createTestApp,
  commitAll,
  commitApp,
  gitExec,
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
    test('createTestWorkspace creates proper directory structure and git repo', () => {
      handle = createTestWorkspace();
      const { root, workspace } = handle;

      expect(existsSync(join(root, 'apps'))).toBe(true);
      expect(existsSync(join(root, 'data'))).toBe(true);
      expect(existsSync(join(root, 'draft'))).toBe(true);
      expect(existsSync(join(root, 'workspace.yaml'))).toBe(true);
      expect(existsSync(join(root, '.gitignore'))).toBe(true);

      // Verify git repo
      const log = gitExec(root, ['log', '--oneline']);
      expect(log).toContain('init workspace');
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
    });
  });

  // --- scanApps ---

  describe('scanApps', () => {
    test('discovers app with migrations', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const apps = handle.workspace.scanApps();

      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('myapp');
      expect(apps[0].migrations).toHaveLength(1);
    });

    test('discovers seeds directory', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
        seeds: { '01_data.sql': "INSERT INTO todos (id, title) VALUES (1, 'test');" },
      });

      const apps = handle.workspace.scanApps();

      expect(apps[0].seeds).toHaveLength(1);
    });

    test('skips directories without app.yaml', () => {
      handle = createTestWorkspace();
      mkdirSync(join(handle.root, 'apps', 'noapp'), { recursive: true });

      const apps = handle.workspace.scanApps();
      expect(apps).toHaveLength(0);
    });

    test('skips dot-prefixed directories', () => {
      handle = createTestWorkspace();
      const hiddenDir = join(handle.root, 'apps', '.hidden');
      mkdirSync(hiddenDir, { recursive: true });
      writeFileSync(join(hiddenDir, 'app.yaml'), 'description: hidden');

      const apps = handle.workspace.scanApps();
      expect(apps).toHaveLength(0);
    });
  });

  // --- getAppState ---

  describe('getAppState', () => {
    test('returns draft_only for new uncommitted app', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toBe('draft_only');
    });

    test('returns stable for committed app with stable DB', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');
      createStableDb(handle.root, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toBe('stable');
    });

    test('returns stable_draft for committed app with unstaged changes and stable DB', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');
      createStableDb(handle.root, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

      // Add uncommitted change
      addMigration(handle.root, 'myapp', '002_add_col.sql', MIGRATION_ADD_PRIORITY);

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toBe('stable_draft');
    });

    test('returns deleted when app.yaml has status: deleted', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        spec: { description: 'to delete', status: 'deleted' },
      });

      const state = handle.workspace.refreshAppState('myapp');
      expect(state).toBe('deleted');
    });

    test('returns undefined for non-existent app', () => {
      handle = createTestWorkspace();

      const state = handle.workspace.getAppState('nonexistent');
      expect(state).toBeUndefined();
    });
  });

  // --- git operations ---

  describe('git operations', () => {
    test('commitApp stages and commits app files', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });

      handle.workspace.commitApp('myapp', 'test: add myapp');

      const log = gitExec(handle.root, ['log', '--oneline']);
      expect(log).toContain('test: add myapp');

      // Working tree should be clean for myapp
      const status = gitExec(handle.root, ['status', '--porcelain', 'apps/myapp/']);
      expect(status.trim()).toBe('');
    });

    test('getCommittedFileContent returns file content from HEAD', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');

      const content = handle.workspace.getCommittedFileContent('apps/myapp/migrations/001_init.sql');
      expect(content).toContain('CREATE TABLE todos');
    });

    test('isFileCommitted returns true for committed files, false for new files', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');

      expect(handle.workspace.isFileCommitted('apps/myapp/migrations/001_init.sql')).toBe(true);

      // Add a new uncommitted file
      addMigration(handle.root, 'myapp', '002_new.sql', MIGRATION_ADD_PRIORITY);
      expect(handle.workspace.isFileCommitted('apps/myapp/migrations/002_new.sql')).toBe(false);
    });

    test('commitApp is a no-op when nothing to commit', () => {
      handle = createTestWorkspace();
      createTestApp(handle.root, 'myapp', {
        migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      });
      commitAll(handle.root, 'add app');

      const logBefore = gitExec(handle.root, ['log', '--oneline']);
      const commitCountBefore = logBefore.trim().split('\n').length;

      handle.workspace.commitApp('myapp', 'should not appear');

      const logAfter = gitExec(handle.root, ['log', '--oneline']);
      const commitCountAfter = logAfter.trim().split('\n').length;

      expect(commitCountAfter).toBe(commitCountBefore);
    });
  });
});
