import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { EventBus } from '../../src/core/event-bus';
import { AppManager } from '../../src/modules/apps/manager';
import {
  MIGRATION_CREATE_TODOS,
  createTestApp,
  createStableDb,
  createTestWorkspace,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';
import { validatePagesJson } from '@cozybase/ui';

describe('AppManager', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  test('create includes ui/pages.json template with valid empty pages structure', async () => {
    handle = createTestWorkspace();
    const manager = new AppManager(handle.workspace);

    const result = await manager.create('my-new-app', 'Test app');

    // ui/pages.json should be in the returned files list
    expect(result.app.files.map((f) => f.path)).toContain('ui/pages.json');

    // The content should be valid parseable JSON
    const uiFile = result.app.files.find((f) => f.path === 'ui/pages.json');
    expect(uiFile).toBeDefined();
    const parsed = JSON.parse(uiFile!.content);
    expect(parsed).toEqual({ pages: [] });

    // It should pass schema validation
    const validation = validatePagesJson(parsed);
    expect(validation.ok).toBe(true);
  });

  test('delete removes only the target app records and keeps other apps intact', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'target', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'hello.ts': 'export default () => "target"' },
    });
    createTestApp(handle, 'survivor', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
      functions: { 'hello.ts': 'export default () => "survivor"' },
    });

    const db = handle.workspace.getPlatformDb();
    db.query(
      'INSERT INTO api_keys (id, app_slug, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    ).run('target-key', 'target', 'hash-target', 'Target Key', 'service');
    db.query(
      'INSERT INTO api_keys (id, app_slug, key_hash, name, role) VALUES (?, ?, ?, ?, ?)',
    ).run('survivor-key', 'survivor', 'hash-survivor', 'Survivor Key', 'service');

    mkdirSync(join(handle.root, 'stable', 'target'), { recursive: true });
    writeFileSync(join(handle.root, 'stable', 'target', 'db.sqlite'), '');
    mkdirSync(join(handle.root, 'draft', 'target'), { recursive: true });
    writeFileSync(join(handle.root, 'draft', 'target', 'db.sqlite'), '');

    mkdirSync(join(handle.root, 'stable', 'survivor'), { recursive: true });
    writeFileSync(join(handle.root, 'stable', 'survivor', 'db.sqlite'), '');
    mkdirSync(join(handle.root, 'draft', 'survivor'), { recursive: true });
    writeFileSync(join(handle.root, 'draft', 'survivor', 'db.sqlite'), '');

    const manager = new AppManager(handle.workspace);
    manager.delete('target');

    expect(db.query('SELECT slug FROM apps WHERE slug = ?').get('target')).toBeNull();
    expect(
      db.query('SELECT COUNT(*) AS count FROM app_files WHERE app_slug = ?').get('target') as { count: number },
    ).toEqual({ count: 0 });
    expect(
      db.query('SELECT COUNT(*) AS count FROM api_keys WHERE app_slug = ?').get('target') as { count: number },
    ).toEqual({ count: 0 });

    expect(db.query('SELECT slug FROM apps WHERE slug = ?').get('survivor')).toEqual({ slug: 'survivor' });
    expect(
      db.query('SELECT COUNT(*) AS count FROM app_files WHERE app_slug = ?').get('survivor') as { count: number },
    ).toEqual({ count: 3 });
    expect(
      db.query('SELECT COUNT(*) AS count FROM api_keys WHERE app_slug = ?').get('survivor') as { count: number },
    ).toEqual({ count: 1 });

    expect(existsSync(join(handle.root, 'stable', 'target'))).toBe(false);
    expect(existsSync(join(handle.root, 'draft', 'target'))).toBe(false);
    expect(existsSync(join(handle.root, 'stable', 'survivor'))).toBe(true);
    expect(existsSync(join(handle.root, 'draft', 'survivor'))).toBe(true);
  });

  test('invokes stable lifecycle hooks on start/stop/delete', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    createStableDb(handle, 'myapp', [MIGRATION_CREATE_TODOS], [1]);

    const db = handle.workspace.getPlatformDb();
    db.query("UPDATE apps SET stable_status = 'stopped' WHERE slug = ?").run('myapp');
    handle.workspace.refreshAppState('myapp');

    const events: string[] = [];
    const manager = new AppManager(
      handle.workspace,
      undefined,
      undefined,
      {
        onStableStarted: (slug) => events.push(`start:${slug}`),
        onStableStopped: (slug) => events.push(`stop:${slug}`),
        onAppDeleted: (slug) => events.push(`delete:${slug}`),
      },
    );

    manager.startStable('myapp');
    manager.stopStable('myapp');
    manager.delete('myapp');

    expect(events).toEqual(['start:myapp', 'stop:myapp', 'delete:myapp']);
  });

  test('updateFile hot-exports functions and reports no rebuild needed', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      functions: {
        'hello.ts': 'export async function GET() { return { v: 1 }; }',
      },
    });
    handle.workspace.refreshAppState('myapp');

    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('app:reconciled', ({ appSlug }) => events.push(appSlug));

    const manager = new AppManager(handle.workspace, undefined, undefined, undefined, eventBus);
    const result = manager.updateFile(
      'myapp',
      'functions/hello.ts',
      'export async function GET() { return { v: 2 }; }',
    );

    expect(result.needsRebuild).toBe(false);
    expect(events).toEqual(['myapp']);
    const draftPath = join(handle.root, 'draft', 'myapp', 'functions', 'hello.ts');
    expect(existsSync(draftPath)).toBe(true);
    expect(readFileSync(draftPath, 'utf-8')).toContain('v: 2');
  });

  test('updateApp re-exports functions, removes deleted files, and flags rebuild when app.yaml changes', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      functions: {
        'hello.ts': 'export async function GET() { return { v: 1 }; }',
        'legacy.ts': 'export async function GET() { return { legacy: true }; }',
      },
      ui: '{"pages":[{"path":"home","title":"Home","body":{"type":"page","id":"root","children":[]}}]}',
    });
    handle.workspace.refreshAppState('myapp');

    const eventBus = new EventBus();
    const events: string[] = [];
    eventBus.on('app:reconciled', ({ appSlug }) => events.push(appSlug));

    const manager = new AppManager(handle.workspace, undefined, undefined, undefined, eventBus);
    const current = manager.getAppWithFiles('myapp');

    const result = manager.updateApp(
      'myapp',
      [
        { path: 'app.yaml', content: 'description: Test app: myapp\n' },
        { path: 'functions/hello.ts', content: 'export async function GET() { return { v: 2 }; }' },
        { path: 'ui/pages.json', content: '{"pages":[]}' },
      ],
      current.current_version,
    );

    expect(result.needsRebuild).toBe(true);
    expect(events).toEqual(['myapp']);
    const helloPath = join(handle.root, 'draft', 'myapp', 'functions', 'hello.ts');
    const uiPath = join(handle.root, 'draft', 'myapp', 'ui', 'pages.json');
    expect(existsSync(helloPath)).toBe(true);
    expect(readFileSync(helloPath, 'utf-8')).toContain('v: 2');
    expect(existsSync(join(handle.root, 'draft', 'myapp', 'functions', 'legacy.ts'))).toBe(false);
    expect(readFileSync(uiPath, 'utf-8')).toBe('{"pages":[]}');
  });

  test('updateApp returns no rebuild when only hot-exportable files change', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      functions: {
        'hello.ts': 'export async function GET() { return { v: 1 }; }',
      },
      ui: '{"pages":[{"path":"home","title":"Home","body":{"type":"page","id":"root","children":[]}}]}',
    });
    handle.workspace.refreshAppState('myapp');

    const manager = new AppManager(handle.workspace);
    const current = manager.getAppWithFiles('myapp');
    const appYaml = current.files.find((file) => file.path === 'app.yaml')?.content;
    if (typeof appYaml !== 'string') {
      throw new Error('Expected app.yaml to exist in test app snapshot');
    }

    const result = manager.updateApp(
      'myapp',
      [
        { path: 'app.yaml', content: appYaml },
        { path: 'functions/hello.ts', content: 'export async function GET() { return { v: 2 }; }' },
        { path: 'ui/pages.json', content: '{"pages":[]}' },
      ],
      current.current_version,
    );

    expect(result.needsRebuild).toBe(false);
  });

  test('updateFile marks migration edits as requiring rebuild without emitting hot-export event', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      migrations: { '001_init.sql': MIGRATION_CREATE_TODOS },
    });
    handle.workspace.refreshAppState('myapp');

    const eventBus = new EventBus();
    let emitted = false;
    eventBus.on('app:reconciled', () => {
      emitted = true;
    });

    const manager = new AppManager(handle.workspace, undefined, undefined, undefined, eventBus);
    const result = manager.updateFile('myapp', 'migrations/001_init.sql', `${MIGRATION_CREATE_TODOS}\n-- comment`);

    expect(result.needsRebuild).toBe(true);
    expect(emitted).toBe(false);
  });

  test('updateFile does not emit reconciled when draft runtime is unavailable', () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'myapp', {
      functions: {
        'hello.ts': 'export async function GET() { return { v: 1 }; }',
      },
    });
    handle.workspace.refreshAppState('myapp');

    const eventBus = new EventBus();
    let emitted = false;
    eventBus.on('app:reconciled', () => {
      emitted = true;
    });

    const fakeRegistry = {
      get: () => undefined,
      start: () => undefined,
      restart: () => undefined,
    } as any;

    const manager = new AppManager(handle.workspace, fakeRegistry, undefined, undefined, eventBus);
    const result = manager.updateFile(
      'myapp',
      'functions/hello.ts',
      'export async function GET() { return { v: 2 }; }',
    );

    expect(result.needsRebuild).toBe(false);
    expect(emitted).toBe(false);
  });
});
