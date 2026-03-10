import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const capturedConfigs: any[] = [];

function projectHistoryFromSnapshot(snapshot: any) {
  const history = snapshot?.state?.history;
  return Array.isArray(history) ? history : [];
}

mock.module('@cozybase/ai-runtime', () => {
  class StubAgentQuery {
    async interrupt() {}
    close() {}
    async *[Symbol.asyncIterator]() {
      yield { type: 'conversation.run.started' };
      yield { type: 'conversation.run.completed', sessionId: 'thread-1' };
    }
  }

  class StubCodexProvider {
    get kind() {
      return 'codex';
    }
    capabilities = {
      toolModes: ['mcp', 'none'],
      supportsResume: true,
      supportsWorkingDirectory: true,
      supportsContextTransform: false,
      supportsHistoryProjection: false,
    };

    createQuery(config: unknown) {
      capturedConfigs.push(config);
      return new StubAgentQuery();
    }

    async createSession(spec: any) {
      const providerKind = this.kind;
      const createQuery = this.createQuery.bind(this);
      let resumeSessionId: string | null = null;
      const listeners = new Set<(event: any) => void>();
      return {
        async prompt(text: string) {
          const query = createQuery({
            prompt: text,
            systemPrompt: spec.systemPrompt,
            cwd: spec.cwd,
            model: spec.model,
            resumeSessionId,
            providerOptions: spec.providerOptions ?? spec.mcpConfig,
          });
          for await (const event of query) {
            if (event.type === 'conversation.run.completed' && event.sessionId) {
              resumeSessionId = event.sessionId;
            }
            for (const listener of listeners) {
              listener(event);
            }
          }
        },
        subscribe(listener: (event: any) => void) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async interrupt() {},
        close() {},
        async exportSnapshot() {
          return resumeSessionId ? { providerKind, version: 1, state: { resumeSessionId } } : null;
        },
        async restoreSnapshot(snapshot: any) {
          const value = snapshot?.state?.resumeSessionId;
          resumeSessionId = typeof value === 'string' ? value : null;
        },
        async getHistory() {
          return [];
        },
      };
    }

    async isAvailable() { return true; }
    dispose() {}
  }

  class StubClaudeProvider extends StubCodexProvider {
    get kind() {
      return 'claude';
    }
  }

  class AgentProviderRegistry {
    providers = new Map<string, any>();
    register(provider: any) { this.providers.set(provider.kind, provider); }
    require(kind: string) {
      const provider = this.providers.get(kind);
      if (!provider) throw new Error(`Unknown provider: ${kind}`);
      return provider;
    }
    list() { return [...this.providers.values()]; }
  }

  return {
    AgentProviderRegistry,
    projectHistoryFromSnapshot,
    CodexProvider: StubCodexProvider,
    ClaudeCodeProvider: StubClaudeProvider,
    PiAgentCoreProvider: class {
      kind = 'pi-agent-core';
      capabilities = {
        toolModes: ['native', 'none'],
        supportsResume: true,
        supportsWorkingDirectory: false,
        supportsContextTransform: true,
        supportsHistoryProjection: true,
      };
      async createSession() {
        return {
          async prompt() {},
          subscribe() { return () => {}; },
          async interrupt() {},
          close() {},
          async exportSnapshot() { return null; },
          async restoreSnapshot() {},
          async getHistory() { return []; },
        };
      }
      async isAvailable() { return true; }
      dispose() {}
    },
  };
});

const { createServer } = await import('../../src/server.ts');

describe('Codex MCP stdio config', () => {
  let previousEnv: Record<string, string | undefined> = {};
  let root: string;

  beforeEach(() => {
    capturedConfigs.length = 0;
    root = mkdtempSync(join(tmpdir(), 'cozybase-codex-stdio-'));
    previousEnv = {
      COZYBASE_AGENT_PROVIDER: process.env.COZYBASE_AGENT_PROVIDER,
    };
    process.env.COZYBASE_AGENT_PROVIDER = 'codex';
  });

  afterEach(() => {
    process.env.COZYBASE_AGENT_PROVIDER = previousEnv.COZYBASE_AGENT_PROVIDER;
    rmSync(root, { recursive: true, force: true });
  });

  test('uses builder-mcp stdio config for builder sessions', async () => {
    const { chatSessionManager, startup, shutdownAgentInfra, workspace } = createServer({
      workspaceDir: root,
      port: 3000,
      host: '127.0.0.1',
      jwtSecret: 'test-secret',
    });

    await startup;

    const session = chatSessionManager.getOrCreate('welcome');
    await session.injectPrompt('hello');

    const config = capturedConfigs.at(-1);
    const mcpConfig = config?.providerOptions?.codexConfig?.mcp_servers?.cozybase;
    expect(mcpConfig?.type).toBe('stdio');
    expect(mcpConfig?.command).toBe('bun');
    expect(Array.isArray(mcpConfig?.args)).toBeTrue();
    expect(mcpConfig?.args).toContain('builder-mcp');

    await shutdownAgentInfra();
    workspace.close();
  });

  test('uses cozybase-mcp stdio config for cozybase sessions', async () => {
    const { cozybaseSessionManager, startup, shutdownAgentInfra, workspace } = createServer({
      workspaceDir: root,
      port: 3000,
      host: '127.0.0.1',
      jwtSecret: 'test-secret',
    });

    await startup;

    const session = cozybaseSessionManager.getOrCreate();
    await session.injectPrompt('hello');

    const config = capturedConfigs.at(-1);
    const mcpConfig = config?.providerOptions?.codexConfig?.mcp_servers?.cozybase;
    expect(mcpConfig?.type).toBe('stdio');
    expect(mcpConfig?.command).toBe('bun');
    expect(Array.isArray(mcpConfig?.args)).toBeTrue();
    expect(mcpConfig?.args).toContain('cozybase-mcp');

    await shutdownAgentInfra();
    workspace.close();
  });
});
