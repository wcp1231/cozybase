import { writeFileSync } from 'fs';
import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentProviderCapabilities, AgentRuntimeProvider, AgentRuntimeSession } from '@cozybase/ai-runtime';
import { AgentProviderRegistry } from '@cozybase/ai-runtime';
import { resolveOperatorRuntime } from '../../src/ai/operator/runtime-config';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

class StubRuntimeProvider implements AgentRuntimeProvider {
  readonly capabilities: AgentProviderCapabilities;

  constructor(
    readonly kind: string,
    toolModes: Array<'native' | 'mcp' | 'none'>,
  ) {
    this.capabilities = {
      toolModes,
      supportsResume: true,
      supportsWorkingDirectory: false,
      supportsContextTransform: false,
      supportsHistoryProjection: true,
    };
  }

  async createSession(): Promise<AgentRuntimeSession> {
    throw new Error('not used');
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

describe('resolveOperatorRuntime', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    delete process.env.COZYBASE_OPERATOR_DISABLE_TOOLS;
    delete process.env.COZYBASE_AGENT_PROVIDER;
    delete process.env.COZYBASE_AGENT_MODEL;
    handle?.cleanup();
  });

  test('loads codex operator runtime provider and direct model string', () => {
    handle = createTestWorkspace();
    handle.workspace.getPlatformRepo().settings.set('operator.agent_provider', 'codex');
    handle.workspace.getPlatformRepo().settings.set('operator.model', 'gpt-5.4');

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('codex');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.model).toBe('gpt-5.4');
  });

  test('loads claude-code operator runtime provider and direct model string', () => {
    handle = createTestWorkspace();
    handle.workspace.getPlatformRepo().settings.set('operator.agent_provider', 'claude-code');
    handle.workspace.getPlatformRepo().settings.set('operator.model', 'claude-sonnet-4-6');

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('claude-code');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.model).toBe('claude-sonnet-4-6');
  });

  test('ignores legacy workspace operator config', () => {
    handle = createTestWorkspace();
    handle.workspace.close();
    writeFileSync(
      `${handle.root}/workspace.yaml`,
      `name: cozybase
version: 1
operator:
  provider: openai
  model: gpt-4o-mini
`,
      'utf-8',
    );
    handle.workspace.load();

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());
    expect(runtime.providerKind).toBe('codex');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.getApiKey).toBeUndefined();
    expect(runtime.model).toBe('gpt-5.4');
  });

  test('inherits builder provider in tool-free debug mode when operator provider is unset', () => {
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS = '1';
    handle = createTestWorkspace();
    handle.workspace.getPlatformRepo().settings.set('agent.provider', 'codex');
    handle.workspace.getPlatformRepo().settings.set('agent.model', 'gpt-5.4');

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('codex');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.model).toBe('gpt-5.4');
  });

  test('does not read workspace.yaml operator config when project settings are absent', () => {
    handle = createTestWorkspace();
    handle.workspace.close();
    writeFileSync(
      `${handle.root}/workspace.yaml`,
      `name: cozybase
version: 1
operator:
  agent_provider: claude-code
  model: claude-sonnet-4-6
`,
      'utf-8',
    );
    handle.workspace.load();

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('codex');
  });

  test('prefers persisted operator settings', () => {
    handle = createTestWorkspace();
    handle.workspace.getPlatformRepo().settings.set('operator.agent_provider', 'codex');
    handle.workspace.getPlatformRepo().settings.set('operator.model', 'gpt-5.4');
    handle.workspace.close();
    writeFileSync(
      `${handle.root}/workspace.yaml`,
      `name: cozybase
version: 1
operator:
  agent_provider: claude-code
  model: claude-sonnet-4-6
`,
      'utf-8',
    );
    handle.workspace.load();

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('codex');
    expect(runtime.model).toBe('gpt-5.4');
  });
});

function createProviderRegistry(): AgentProviderRegistry {
  const registry = new AgentProviderRegistry();
  registry.register(new StubRuntimeProvider('pi-agent-core', ['native', 'none']));
  registry.register(new StubRuntimeProvider('codex', ['mcp', 'none']));
  registry.register(new StubRuntimeProvider('claude', ['mcp', 'none']));
  return registry;
}
