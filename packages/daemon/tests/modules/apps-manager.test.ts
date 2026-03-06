import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
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
});
