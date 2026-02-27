import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { exportUiFromDb } from '../../src/core/file-export';
import {
  createTestWorkspace,
  createTestApp,
  deleteAppFile,
  TEST_UI_PAGES_JSON,
  MIGRATION_CREATE_TODOS,
} from '../helpers/test-workspace';
import type { TestWorkspaceHandle } from '../helpers/test-workspace';

describe('exportUiFromDb', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('exports ui/pages.json when record exists in DB', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      ui: TEST_UI_PAGES_JSON,
    });

    const targetDir = join(handle.root, 'draft', 'apps', 'myapp');
    mkdirSync(targetDir, { recursive: true });

    const platformDb = handle.workspace.getPlatformDb();
    const result = exportUiFromDb(platformDb, 'myapp', targetDir);

    expect(result).toBe(true);

    const uiPath = join(targetDir, 'ui', 'pages.json');
    expect(existsSync(uiPath)).toBe(true);

    const content = readFileSync(uiPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(JSON.parse(TEST_UI_PAGES_JSON));
  });

  test('returns false and does not create file when no UI record exists', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      // no ui
    });

    const targetDir = join(handle.root, 'draft', 'apps', 'myapp');
    mkdirSync(targetDir, { recursive: true });

    const platformDb = handle.workspace.getPlatformDb();
    const result = exportUiFromDb(platformDb, 'myapp', targetDir);

    expect(result).toBe(false);

    const uiPath = join(targetDir, 'ui', 'pages.json');
    expect(existsSync(uiPath)).toBe(false);
  });

  test('overwrites existing ui/pages.json with new content', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      ui: TEST_UI_PAGES_JSON,
    });

    const targetDir = join(handle.root, 'draft', 'apps', 'myapp');
    mkdirSync(join(targetDir, 'ui'), { recursive: true });

    // Write stale content first
    const uiPath = join(targetDir, 'ui', 'pages.json');
    writeFileSync(uiPath, '{"old": true}', 'utf-8');

    const platformDb = handle.workspace.getPlatformDb();
    const result = exportUiFromDb(platformDb, 'myapp', targetDir);

    expect(result).toBe(true);

    const content = readFileSync(uiPath, 'utf-8');
    expect(JSON.parse(content)).toEqual(JSON.parse(TEST_UI_PAGES_JSON));
  });

  test('cleans up stale ui/pages.json when UI record is removed from DB', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      ui: TEST_UI_PAGES_JSON,
    });

    const targetDir = join(handle.root, 'draft', 'apps', 'myapp');
    mkdirSync(targetDir, { recursive: true });

    const platformDb = handle.workspace.getPlatformDb();

    // First export — file created
    exportUiFromDb(platformDb, 'myapp', targetDir);
    const uiPath = join(targetDir, 'ui', 'pages.json');
    expect(existsSync(uiPath)).toBe(true);

    // Delete UI record from DB
    deleteAppFile(handle, 'myapp', 'ui/pages.json');

    // Second export — stale file should be cleaned up
    const result = exportUiFromDb(platformDb, 'myapp', targetDir);
    expect(result).toBe(false);
    expect(existsSync(uiPath)).toBe(false);
  });
});
