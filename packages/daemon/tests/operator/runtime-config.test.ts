import { afterEach, describe, expect, test } from 'bun:test';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { stringify as stringifyYAML } from 'yaml';
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
    writeWorkspaceConfig(handle, {
      operator: {
        agent_provider: 'codex',
        model: 'gpt-5.4',
      },
    });

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('codex');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.model).toBe('gpt-5.4');
  });

  test('loads claude-code operator runtime provider and direct model string', () => {
    handle = createTestWorkspace();
    writeWorkspaceConfig(handle, {
      operator: {
        agent_provider: 'claude-code',
        model: 'claude-sonnet-4-6',
      },
    });

    const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());

    expect(runtime.providerKind).toBe('claude-code');
    expect(runtime.toolMode).toBe('mcp');
    expect(runtime.model).toBe('claude-sonnet-4-6');
  });

  test('keeps backward compatibility for legacy operator.provider', () => {
    handle = createTestWorkspace();
    writeWorkspaceConfig(handle, {
      operator: {
        provider: 'openai',
        model: 'gpt-4o-mini',
      },
    });

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown, ...rest: unknown[]) => {
      warnings.push([message, ...rest].map((entry) => String(entry)).join(' '));
    };

    try {
      const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());
      expect(runtime.providerKind).toBe('pi-agent-core');
      expect(runtime.toolMode).toBe('native');
      expect(runtime.getApiKey).toBeFunction();
      expect(JSON.stringify(runtime.model)).toContain('gpt-4o-mini');
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((warning) => warning.includes('deprecated operator.provider'))).toBe(true);
  });

  test('treats legacy operator.provider=codex as operator.agent_provider', () => {
    handle = createTestWorkspace();
    writeWorkspaceConfig(handle, {
      operator: {
        provider: 'codex',
        model: 'gpt-5.4',
      },
    });

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message?: unknown, ...rest: unknown[]) => {
      warnings.push([message, ...rest].map((entry) => String(entry)).join(' '));
    };

    try {
      const runtime = resolveOperatorRuntime(handle.workspace, createProviderRegistry());
      expect(runtime.providerKind).toBe('codex');
      expect(runtime.toolMode).toBe('mcp');
      expect(runtime.model).toBe('gpt-5.4');
    } finally {
      console.warn = originalWarn;
    }

    expect(warnings.some((warning) => warning.includes('operator.agent_provider'))).toBe(true);
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
});

function createProviderRegistry(): AgentProviderRegistry {
  const registry = new AgentProviderRegistry();
  registry.register(new StubRuntimeProvider('pi-agent-core', ['native', 'none']));
  registry.register(new StubRuntimeProvider('codex', ['mcp', 'none']));
  registry.register(new StubRuntimeProvider('claude', ['mcp', 'none']));
  return registry;
}

function writeWorkspaceConfig(handle: TestWorkspaceHandle, config: Record<string, unknown>): void {
  writeFileSync(
    join(handle.root, 'workspace.yaml'),
    stringifyYAML({
      name: 'cozybase',
      version: 1,
      ...config,
    }),
    'utf-8',
  );
}
