import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
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
      HOME: process.env.HOME,
      PATH: process.env.PATH,
    };
    delete process.env.COZYBASE_AGENT_PROVIDER;
    delete process.env.COZYBASE_AGENT_MODEL;
    delete process.env.COZYBASE_AGENT_MODEL_PROVIDER;
  });

  afterEach(() => {
    process.env.COZYBASE_AGENT_PROVIDER = previousEnv.COZYBASE_AGENT_PROVIDER;
    process.env.COZYBASE_AGENT_MODEL = previousEnv.COZYBASE_AGENT_MODEL;
    process.env.COZYBASE_AGENT_MODEL_PROVIDER = previousEnv.COZYBASE_AGENT_MODEL_PROVIDER;
    process.env.HOME = previousEnv.HOME;
    process.env.PATH = previousEnv.PATH;
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

  test('returns aggregated agent settings in a single response', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/agents');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        builder: {
          data: {
            provider: 'claude',
            model: 'claude-sonnet-4-6',
          },
        },
        operator: {
          data: {
            provider: 'pi-agent-core',
            modelProvider: 'anthropic',
            model: 'claude-sonnet-4-20250514',
          },
        },
        cozybase: {
          data: {
            provider: 'claude-code',
            modelProvider: 'anthropic',
            model: 'claude-sonnet-4-6',
          },
        },
      },
    });
  });

  test('updates aggregated agent settings in a single request', async () => {
    handle = createTestWorkspace();
    const { app, workspace } = createServer(createTestConfig(handle.root));

    const res = await app.request(
      jsonReq('/api/v1/settings/agents', 'PUT', {
        builder: { provider: 'codex' },
        cozybase: { provider: 'codex' },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        builder: {
          data: {
            provider: 'codex',
            model: 'gpt-5.3-codex',
          },
        },
        operator: {
          data: {
            provider: 'pi-agent-core',
          },
        },
        cozybase: {
          data: {
            provider: 'codex',
            model: 'gpt-5.4',
          },
        },
      },
    });

    expect(workspace.getPlatformRepo().settings.get('agent.provider')).toBe('codex');
    expect(workspace.getPlatformRepo().settings.get('cozybase_agent.agent_provider')).toBe('codex');
    expect(workspace.getPlatformRepo().settings.get('operator.agent_provider')).toBeNull();
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

  test('reports missing OpenClaw home directory', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    process.env.PATH = '';
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/openclaw');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        enabled: false,
        openClawDirPath: join(handle.root, '.openclaw'),
        skillsDirPath: join(handle.root, '.openclaw', 'skills', 'cozybase'),
        skillFilePath: join(handle.root, '.openclaw', 'skills', 'cozybase', 'SKILL.md'),
        acpxConfigPath: join(handle.root, '.acpx', 'config.json'),
        openClawDirExists: false,
        skillsDirExists: false,
        skillFileExists: false,
        acpxExecutableExists: false,
        acpxConfigExists: false,
        acpxConfigValid: false,
      },
    });
  });

  test('persists OpenClaw enabled toggle in platform settings', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    mkdirSync(join(handle.root, '.openclaw'), { recursive: true });
    const { app, workspace } = createServer(createTestConfig(handle.root));

    const putRes = await app.request(
      jsonReq('/api/v1/settings/openclaw', 'PUT', {
        enabled: true,
      }),
    );

    expect(putRes.status).toBe(200);
    expect(await putRes.json()).toMatchObject({
      data: {
        enabled: true,
      },
    });
    expect(workspace.getPlatformRepo().settings.get('openclaw.enabled')).toBe('true');

    const getRes = await app.request('/api/v1/settings/openclaw');
    expect(getRes.status).toBe(200);
    expect(await getRes.json()).toMatchObject({
      data: {
        enabled: true,
      },
    });
  });

  test('can auto-configure existing ~/.acpx/config.json', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    mkdirSync(join(handle.root, '.openclaw'), { recursive: true });
    mkdirSync(join(handle.root, '.acpx'), { recursive: true });
    writeFileSync(
      join(handle.root, '.acpx', 'config.json'),
      JSON.stringify({
        defaultAgent: 'assistant',
        agents: {
          assistant: { command: 'assistant run' },
        },
      }, null, 2),
      'utf-8',
    );
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/openclaw/configure-acpx', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        acpxConfigExists: true,
        acpxConfigValid: true,
      },
    });

    const raw = JSON.parse(readFileSync(join(handle.root, '.acpx', 'config.json'), 'utf-8'));
    expect(raw).toMatchObject({
      defaultAgent: 'assistant',
      agents: {
        assistant: { command: 'assistant run' },
        cozybase: {
          command: '~/.cozybase/bin/cozybase acp',
        },
      },
    });
  });

  test('rejects skills directory creation when ~/.openclaw is missing', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/openclaw/create-skills-dir', { method: 'POST' });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: {
        code: 'OPENCLAW_DIR_NOT_FOUND',
      },
    });
  });

  test('creates ~/.openclaw/skills/cozybase when OpenClaw home exists', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    mkdirSync(join(handle.root, '.openclaw'), { recursive: true });
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/openclaw/create-skills-dir', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        openClawDirExists: true,
        skillsDirExists: true,
        skillFileExists: true,
      },
    });
    const skillText = readFileSync(join(handle.root, '.openclaw', 'skills', 'cozybase', 'SKILL.md'), 'utf-8');
    expect(skillText).toContain('CozyBase is a local Supabase-like platform designed for AI Agents.');
    expect(skillText).toContain('`acpx cozybase exec "<Prompt text>"`');
  });

  test('detects acpx executable on PATH', async () => {
    handle = createTestWorkspace();
    process.env.HOME = handle.root;
    mkdirSync(join(handle.root, '.openclaw'), { recursive: true });
    const binDir = join(handle.root, 'bin');
    const acpxPath = join(binDir, 'acpx');
    mkdirSync(binDir, { recursive: true });
    writeFileSync(acpxPath, '#!/bin/sh\nexit 0\n', 'utf-8');
    chmodSync(acpxPath, 0o755);
    process.env.PATH = binDir;
    const { app } = createServer(createTestConfig(handle.root));

    const res = await app.request('/api/v1/settings/openclaw');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      data: {
        acpxExecutableExists: true,
        acpxExecutablePath: acpxPath,
      },
    });
  });
});
