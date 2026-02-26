/**
 * Agent Working Directory Management — Unit Tests
 *
 * Tests writeAppToDir, clearAppDir, collectAppFromDir.
 */

import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

import {
  writeAppToDir,
  clearAppDir,
  collectAppFromDir,
  getAppDir,
  assertSafePath,
} from '../../src/mcp/app-dir';

let tempDir: string;

afterEach(() => {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function setup() {
  tempDir = mkdtempSync(join(tmpdir(), 'cozybase-appdir-test-'));
  return tempDir;
}

describe('getAppDir', () => {
  test('returns correct path', () => {
    expect(getAppDir('/workspace', 'myapp')).toBe('/workspace/myapp');
  });
});

describe('writeAppToDir', () => {
  test('writes files to the correct paths', () => {
    const appsDir = setup();

    writeAppToDir(appsDir, 'todo', [
      { path: 'app.yaml', content: 'name: todo' },
      { path: 'migrations/001_init.sql', content: 'CREATE TABLE t (id INT);' },
      { path: 'functions/hello.ts', content: 'export default () => "hi"' },
    ]);

    expect(readFileSync(join(appsDir, 'todo', 'app.yaml'), 'utf-8')).toBe('name: todo');
    expect(readFileSync(join(appsDir, 'todo', 'migrations/001_init.sql'), 'utf-8')).toBe(
      'CREATE TABLE t (id INT);',
    );
    expect(readFileSync(join(appsDir, 'todo', 'functions/hello.ts'), 'utf-8')).toBe(
      'export default () => "hi"',
    );
  });

  test('creates nested directories as needed', () => {
    const appsDir = setup();

    writeAppToDir(appsDir, 'deep', [
      { path: 'a/b/c/d.txt', content: 'deep file' },
    ]);

    expect(existsSync(join(appsDir, 'deep', 'a', 'b', 'c', 'd.txt'))).toBe(true);
  });
});

describe('clearAppDir', () => {
  test('removes app directory entirely', () => {
    const appsDir = setup();
    const appDir = join(appsDir, 'todo');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, 'test.txt'), 'content');

    clearAppDir(appsDir, 'todo');

    expect(existsSync(appDir)).toBe(false);
  });

  test('no-op if directory does not exist', () => {
    const appsDir = setup();
    // Should not throw
    clearAppDir(appsDir, 'nonexistent');
  });
});

describe('collectAppFromDir', () => {
  test('collects all files with relative paths', () => {
    const appsDir = setup();

    writeAppToDir(appsDir, 'todo', [
      { path: 'app.yaml', content: 'name: todo' },
      { path: 'migrations/001.sql', content: 'SQL' },
    ]);

    const files = collectAppFromDir(appsDir, 'todo');

    expect(files.length).toBe(2);
    const paths = files.map((f) => f.path).sort();
    expect(paths).toEqual(['app.yaml', 'migrations/001.sql']);

    const yamlFile = files.find((f) => f.path === 'app.yaml');
    expect(yamlFile?.content).toBe('name: todo');
  });

  test('returns empty array for nonexistent app', () => {
    const appsDir = setup();
    expect(collectAppFromDir(appsDir, 'nonexistent')).toEqual([]);
  });

  test('skips hidden files and directories', () => {
    const appsDir = setup();
    const appDir = join(appsDir, 'myapp');
    mkdirSync(appDir, { recursive: true });
    writeFileSync(join(appDir, '.hidden'), 'secret');
    writeFileSync(join(appDir, 'visible.txt'), 'ok');

    mkdirSync(join(appDir, '.git'), { recursive: true });
    writeFileSync(join(appDir, '.git', 'config'), 'gitconfig');

    const files = collectAppFromDir(appsDir, 'myapp');
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('visible.txt');
  });

  test('skips files over 1MB', () => {
    const appsDir = setup();
    const appDir = join(appsDir, 'big');
    mkdirSync(appDir, { recursive: true });

    writeFileSync(join(appDir, 'small.txt'), 'small');
    writeFileSync(join(appDir, 'huge.bin'), Buffer.alloc(1024 * 1024 + 1, 'x'));

    const files = collectAppFromDir(appsDir, 'big');
    expect(files.length).toBe(1);
    expect(files[0].path).toBe('small.txt');
  });
});

describe('Path traversal protection', () => {
  test('assertSafePath allows normal paths', () => {
    const appDir = '/tmp/apps/myapp';
    expect(assertSafePath(appDir, 'app.yaml')).toBe('/tmp/apps/myapp/app.yaml');
    expect(assertSafePath(appDir, 'migrations/001.sql')).toBe('/tmp/apps/myapp/migrations/001.sql');
  });

  test('assertSafePath rejects path traversal with ../', () => {
    const appDir = '/tmp/apps/myapp';
    expect(() => assertSafePath(appDir, '../../../etc/passwd')).toThrow(/Path traversal/);
    expect(() => assertSafePath(appDir, '../../other-app/secret.txt')).toThrow(/Path traversal/);
  });

  test('assertSafePath rejects absolute paths', () => {
    const appDir = '/tmp/apps/myapp';
    expect(() => assertSafePath(appDir, '/etc/passwd')).toThrow(/Path traversal/);
  });

  test('writeAppToDir rejects files with path traversal', () => {
    const appsDir = setup();

    expect(() =>
      writeAppToDir(appsDir, 'todo', [
        { path: '../../etc/evil.txt', content: 'malicious' },
      ]),
    ).toThrow(/Path traversal/);
  });
});
