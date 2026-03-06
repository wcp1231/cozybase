import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer } from '../../src/server';
import type { Config } from '../../src/config';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

function createTestConfig(root: string): Config {
  return {
    port: 0,
    host: '127.0.0.1',
    workspaceDir: root,
    jwtSecret: 'test-secret',
  };
}

function jsonReq(path: string, method: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Settings API (/api/v1/settings)', () => {
  let handle: TestWorkspaceHandle;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(() => {
    previousEnv = {
      COZYBASE_AGENT_PROVIDER: process.env.COZYBASE_AGENT_PROVIDER,
      COZYBASE_AGENT_MODEL: process.env.COZYBASE_AGENT_MODEL,
    };
    delete process.env.COZYBASE_AGENT_PROVIDER;
    delete process.env.COZYBASE_AGENT_MODEL;
  });

  afterEach(() => {
    process.env.COZYBASE_AGENT_PROVIDER = previousEnv.COZYBASE_AGENT_PROVIDER;
    process.env.COZYBASE_AGENT_MODEL = previousEnv.COZYBASE_AGENT_MODEL;
    handle?.cleanup();
  });

  test('returns the effective default provider and model when nothing is stored', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/agent');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
      },
    });
  });

  test('does not partially persist provider changes when model validation fails', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const putRes = await app.request(
      jsonReq('/api/v1/settings/agent', 'PUT', {
        provider: 'codex',
        model: 'claude-sonnet-4-6',
      }),
    );

    expect(putRes.status).toBe(400);

    const getRes = await app.request('/api/v1/settings/agent');
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({
      data: {
        provider: 'claude',
        model: 'claude-sonnet-4-6',
      },
    });
  });

  test('switching provider without an explicit model stores the new default model', async () => {
    handle = createTestWorkspace();
    const { app, workspace } = createServer(createTestConfig(handle.root));

    const putRes = await app.request(
      jsonReq('/api/v1/settings/agent', 'PUT', {
        provider: 'codex',
      }),
    );

    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      data: {
        provider: 'codex',
        model: 'gpt-5.3-codex',
      },
    });

    expect(workspace.getPlatformRepo().settings.get('agent.provider')).toBe('codex');
    expect(workspace.getPlatformRepo().settings.get('agent.model')).toBe('gpt-5.3-codex');
  });
});
