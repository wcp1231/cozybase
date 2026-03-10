import { afterEach, describe, expect, test } from 'bun:test';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import {
  createTestApp,
  createTestWorkspace,
  type TestWorkspaceHandle,
} from '../helpers/test-workspace';

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

describe('Auto CRUD routes default values', () => {
  let handle: TestWorkspaceHandle;
  let registry: any;

  afterEach(() => {
    try {
      registry?.shutdownAll();
    } catch {
      // ignore cleanup errors
    }
    handle?.cleanup();
    registry = null;
  });

  test('POST /fn/_db/tables/:table rejects empty objects', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'settings-app', {
      migrations: {
        '001_init.sql': `
CREATE TABLE app_settings (
  config_key TEXT PRIMARY KEY DEFAULT 'default',
  enabled INTEGER NOT NULL DEFAULT 1
);
`,
      },
    });

    const { app, registry: runtimeRegistry, startup } = createServer(createTestConfig(handle.root));
    registry = runtimeRegistry;
    await startup;

    await app.request('/draft/apps/settings-app/rebuild', { method: 'POST' });

    const createRes = await app.request('http://localhost/draft/apps/settings-app/fn/_db/tables/app_settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(createRes.status).toBe(400);
    const payload = await createRes.json() as { error?: { message?: string } };
    expect(payload.error?.message).toBe('Request body must include at least one field');
  });
});
