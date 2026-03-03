import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AppManager } from '../../src/modules/apps/manager';
import {
  MIGRATION_CREATE_TODOS,
  createTestApp,
  createTestWorkspace,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';

describe('AppManager', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    handle?.cleanup();
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
});
