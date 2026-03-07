import { describe, test, expect, afterEach } from 'bun:test';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  classifyAppFileUpdate,
  exportFunctionsFromDb,
  exportSingleFunction,
  exportUiFromDb,
} from '../../src/core/file-export';
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

    const platformRepo = handle.workspace.getPlatformRepo();
    const result = exportUiFromDb(platformRepo, 'myapp', targetDir);

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

    const platformRepo = handle.workspace.getPlatformRepo();
    const result = exportUiFromDb(platformRepo, 'myapp', targetDir);

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

    const platformRepo = handle.workspace.getPlatformRepo();
    const result = exportUiFromDb(platformRepo, 'myapp', targetDir);

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

    const platformRepo = handle.workspace.getPlatformRepo();

    // First export — file created
    exportUiFromDb(platformRepo, 'myapp', targetDir);
    const uiPath = join(targetDir, 'ui', 'pages.json');
    expect(existsSync(uiPath)).toBe(true);

    // Delete UI record from DB
    deleteAppFile(handle, 'myapp', 'ui/pages.json');

    // Second export — stale file should be cleaned up
    const result = exportUiFromDb(platformRepo, 'myapp', targetDir);
    expect(result).toBe(false);
    expect(existsSync(uiPath)).toBe(false);
  });
});

describe('file export helpers', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    if (handle) handle.cleanup();
  });

  test('classifies hot-export and rebuild-triggering paths correctly', () => {
    expect(classifyAppFileUpdate('ui/pages.json')).toEqual({ kind: 'ui', needsRebuild: false });
    expect(classifyAppFileUpdate('functions/hello.ts')).toEqual({ kind: 'function', needsRebuild: false });
    expect(classifyAppFileUpdate('migrations/001_init.sql')).toEqual({ kind: 'rebuild', needsRebuild: true });
    expect(classifyAppFileUpdate('package.json')).toEqual({ kind: 'rebuild', needsRebuild: true });
    expect(classifyAppFileUpdate('README.md')).toEqual({ kind: 'other', needsRebuild: false });
  });

  test('exports a single function file to the draft directory', () => {
    handle = createTestWorkspace();
    const targetDir = join(handle.root, 'draft', 'apps', 'myapp');

    const dest = exportSingleFunction(
      targetDir,
      'functions/api/hello.ts',
      'export async function GET() { return { ok: true }; }',
    );

    expect(dest).toBe(join(targetDir, 'functions', 'api', 'hello.ts'));
    expect(readFileSync(dest, 'utf-8')).toContain('ok: true');
  });

  test('full function export removes deleted files on subsequent export', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      functions: {
        'hello.ts': 'export async function GET() { return { v: 1 }; }',
        'legacy.ts': 'export async function GET() { return { legacy: true }; }',
      },
    });

    const targetDir = join(handle.root, 'draft', 'apps', 'myapp', 'functions');
    const platformRepo = handle.workspace.getPlatformRepo();

    exportFunctionsFromDb(platformRepo, 'myapp', targetDir);
    expect(existsSync(join(targetDir, 'legacy.ts'))).toBe(true);

    deleteAppFile(handle, 'myapp', 'functions/legacy.ts');
    exportFunctionsFromDb(platformRepo, 'myapp', targetDir);

    expect(existsSync(join(targetDir, 'legacy.ts'))).toBe(false);
    expect(existsSync(join(targetDir, 'hello.ts'))).toBe(true);
  });
});
