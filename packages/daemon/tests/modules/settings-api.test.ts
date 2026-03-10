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
      COZYBASE_AGENT_MODEL_PROVIDER: process.env.COZYBASE_AGENT_MODEL_PROVIDER,
    };
    delete process.env.COZYBASE_AGENT_PROVIDER;
    delete process.env.COZYBASE_AGENT_MODEL;
    delete process.env.COZYBASE_AGENT_MODEL_PROVIDER;
  });

  afterEach(() => {
    process.env.COZYBASE_AGENT_PROVIDER = previousEnv.COZYBASE_AGENT_PROVIDER;
    process.env.COZYBASE_AGENT_MODEL = previousEnv.COZYBASE_AGENT_MODEL;
    process.env.COZYBASE_AGENT_MODEL_PROVIDER = previousEnv.COZYBASE_AGENT_MODEL_PROVIDER;
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

  test('returns the effective default operator provider and model when nothing is stored', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/operator-agent');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        provider: 'pi-agent-core',
        modelProvider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
      },
    });
  });

  test('stores operator settings in platform settings', async () => {
    handle = createTestWorkspace();
    const { app, workspace } = createServer(createTestConfig(handle.root));

    const putRes = await app.request(
      jsonReq('/api/v1/settings/operator-agent', 'PUT', {
        provider: 'codex',
      }),
    );

    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      data: {
        provider: 'codex',
        modelProvider: null,
        model: 'gpt-5.4',
      },
    });

    expect(workspace.getPlatformRepo().settings.get('operator.agent_provider')).toBe('codex');
    expect(workspace.getPlatformRepo().settings.get('operator.model')).toBe('gpt-5.4');
    expect(workspace.getPlatformRepo().settings.get('operator.model_provider')).toBeNull();
  });

  test('validates pi-agent-core operator model provider and model', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request(
      jsonReq('/api/v1/settings/operator-agent', 'PUT', {
        provider: 'pi-agent-core',
        modelProvider: 'invalid',
        model: 'gpt-4o-mini',
      }),
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: 'INVALID_MODEL_PROVIDER',
      },
    });
  });

  test('returns the effective default cozybase provider and model when nothing is stored', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/cozybase-agent');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        provider: 'claude-code',
        modelProvider: 'anthropic',
        model: 'claude-sonnet-4-6',
      },
    });
  });

  test('cozybase agent falls back from legacy claude-haiku to the supported default model', async () => {
    handle = createTestWorkspace();
    const { app, workspace } = createServer(createTestConfig(handle.root));

    workspace.getPlatformRepo().transaction(() => {
      workspace.getPlatformRepo().settings.set('cozybase_agent.agent_provider', 'claude-code');
      workspace.getPlatformRepo().settings.set('cozybase_agent.model_provider', 'anthropic');
      workspace.getPlatformRepo().settings.set('cozybase_agent.model', 'claude-haiku');
    });

    const res = await app.request('/api/v1/settings/cozybase-agent');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        provider: 'claude-code',
        modelProvider: 'anthropic',
        model: 'claude-sonnet-4-6',
      },
    });
  });
});
