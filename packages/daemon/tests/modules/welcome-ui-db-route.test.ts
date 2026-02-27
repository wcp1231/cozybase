import { describe, test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

describe('Welcome template routes', () => {
  let root = '';
  let registry: any;

  afterEach(() => {
    try {
      registry?.shutdownAll();
    } catch {
      // ignore cleanup errors
    }
    if (root) {
      rmSync(root, { recursive: true, force: true });
    }
    root = '';
    registry = null;
  });

  test('welcome UI uses /fn/_db routes and they are callable', async () => {
    root = mkdtempSync(join(tmpdir(), 'cozybase-welcome-'));

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(root));
    registry = runtimeRegistry;
    await startup;

    const uiRes = await app.request('http://localhost/stable/apps/welcome/ui');
    expect(uiRes.status).toBe(200);
    const ui = await uiRes.json() as { data: unknown };
    expect(JSON.stringify(ui.data)).toContain('/fn/_db/tables/todo');

    const listRes = await app.request('http://localhost/stable/apps/welcome/fn/_db/tables/todo');
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json() as { data: unknown[] };
    expect(Array.isArray(listBody.data)).toBe(true);
  });
});
