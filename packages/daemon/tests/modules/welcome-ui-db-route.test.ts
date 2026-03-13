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

  test('welcome UI is auto-published and accessible in stable mode', async () => {
    root = mkdtempSync(join(tmpdir(), 'cozybase-welcome-'));

    const { app, registry: runtimeRegistry, startup, workspace } = createServer(createTestConfig(root));
    registry = runtimeRegistry;
    await startup;

    expect(workspace.getAppState('welcome')).toEqual({ stableStatus: 'running', hasDraft: false });

    const uiRes = await app.request('http://localhost/stable/apps/welcome/ui');
    expect(uiRes.status).toBe(200);
    const ui = await uiRes.json() as { data: unknown };
    expect(JSON.stringify(ui.data)).toContain('Cozybase');
  });
});
