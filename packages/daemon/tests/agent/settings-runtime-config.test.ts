import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { Config } from '../../src/config';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

const capturedConfigs: Array<{ providerKind: 'claude' | 'codex'; config: any }> = [];

function projectHistoryFromSnapshot(snapshot: any) {
  const history = snapshot?.state?.history;
  return Array.isArray(history) ? history : [];
}

mock.module('@cozybase/ai-runtime', () => {
  class StubAgentQuery {
    constructor(private readonly events: any[]) {}

    async interrupt() {}
    close() {}

    async *[Symbol.asyncIterator]() {
      for (const event of this.events) {
        yield event;
      }
    }
  }

  class BaseStubProvider {
    constructor(private readonly providerKind: 'claude' | 'codex') {}

    get kind() {
      return this.providerKind;
    }
    capabilities = {
      toolModes: ['mcp', 'none'],
      supportsResume: true,
      supportsWorkingDirectory: true,
      supportsContextTransform: false,
      supportsHistoryProjection: false,
    };

    createQuery(config: any) {
      capturedConfigs.push({ providerKind: this.providerKind, config });

      const isExtract =
        typeof config.systemPrompt === 'string' &&
        config.systemPrompt.includes('JSON extraction assistant');

      return new StubAgentQuery(
        isExtract
          ? [
              { type: 'conversation.run.started' },
              {
                type: 'conversation.message.completed',
                messageId: 'm-1',
                role: 'assistant',
                content: '{"slug":"todo-app","displayName":"Todo App","description":"A todo app"}',
              },
              { type: 'conversation.run.completed', sessionId: `${this.providerKind}-extract` },
            ]
          : [
              { type: 'conversation.run.started' },
              { type: 'conversation.run.completed', sessionId: `${this.providerKind}-chat` },
            ],
      );
    }

    async isAvailable() {
      return true;
    }

    async createSession(spec: any) {
      const providerKind = this.providerKind;
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
          return resumeSessionId
            ? { providerKind, version: 1, state: { resumeSessionId } }
            : null;
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

    dispose() {}
  }

  class AgentProviderRegistry {
    providers = new Map<string, any>();

    register(provider: any) {
      this.providers.set(provider.kind, provider);
    }

    require(kind: string) {
      const provider = this.providers.get(kind);
      if (!provider) {
        throw new Error(`Unknown provider: ${kind}`);
      }
      return provider;
    }

    list() {
      return [...this.providers.values()];
    }
  }

  return {
    AgentProviderRegistry,
    projectHistoryFromSnapshot,
    ClaudeCodeProvider: class extends BaseStubProvider {
      constructor() {
        super('claude');
      }
    },
    CodexProvider: class extends BaseStubProvider {
      constructor() {
        super('codex');
      }
    },
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
          subscribe() {
            return () => {};
          },
          async interrupt() {},
          close() {},
          async exportSnapshot() {
            return null;
          },
          async restoreSnapshot() {},
          async getHistory() {
            return [];
          },
        };
      }
      async isAvailable() {
        return true;
      }
      dispose() {}
    },
  };
});

const { createServer } = await import('../../src/server.ts');

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

describe('Server agent runtime settings', () => {
  let handle: TestWorkspaceHandle;
  let previousEnv: Record<string, string | undefined>;

  beforeEach(() => {
    capturedConfigs.length = 0;
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

  test('uses persisted settings for AI app creation and follow-up chat session', async () => {
    handle = createTestWorkspace();
    const { app } = createServer(createTestConfig(handle.root));

    const settingsRes = await app.request(
      jsonReq('/api/v1/settings/agent', 'PUT', {
        provider: 'codex',
        model: 'gpt-5.4',
      }),
    );
    expect(settingsRes.status).toBe(200);

    const createRes = await app.request(
      jsonReq('/api/v1/apps/create-with-ai', 'POST', {
        idea: 'build a todo app',
      }),
    );
    expect(createRes.status).toBe(201);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(capturedConfigs.length).toBeGreaterThanOrEqual(2);
    expect(capturedConfigs.every((entry) => entry.providerKind === 'codex')).toBeTrue();
    expect(capturedConfigs.every((entry) => entry.config.model === 'gpt-5.4')).toBeTrue();
  });
});
