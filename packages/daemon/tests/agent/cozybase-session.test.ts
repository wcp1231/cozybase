import { afterEach, describe, expect, test } from 'bun:test';
import type {
  AgentEvent,
  AgentProvider,
  AgentProviderCapabilities,
  AgentQuery,
  AgentQueryConfig,
  AgentRuntimeProvider,
  AgentRuntimeSession,
  AgentSessionSpec,
} from '@cozybase/ai-runtime';
import type { DelegatedTask } from '@cozybase/cozybase-agent';
import { RuntimeSessionStore } from '../../src/ai/runtime-session-store';
import { EventBus } from '../../src/core/event-bus';
import { CozyBaseSession } from '../../src/ai/cozybase/session';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

class DeferredAgentQuery implements AgentQuery {
  private readonly events: AgentEvent[] = [{ type: 'conversation.run.started' }];
  private resolver: (() => void) | null = null;
  private readonly done = new Promise<void>((resolve) => {
    this.resolver = resolve;
  });

  finish(events: AgentEvent[]): void {
    this.events.push(...events);
    this.resolver?.();
  }

  async interrupt(): Promise<void> {}

  close(): void {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    yield this.events[0];
    await this.done;
    for (const event of this.events.slice(1)) {
      yield event;
    }
  }
}

class StubAgentProvider implements AgentProvider, AgentRuntimeProvider {
  readonly kind = 'claude';
  readonly capabilities: AgentProviderCapabilities = {
    toolModes: ['mcp', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: true,
    supportsContextTransform: false,
    supportsHistoryProjection: false,
  };
  readonly prompts: string[] = [];

  constructor(private readonly queryFactory: (config: AgentQueryConfig) => AgentQuery) {}

  createQuery(config: AgentQueryConfig): AgentQuery {
    this.prompts.push(config.prompt);
    return this.queryFactory(config);
  }

  async createSession(_spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    throw new Error('not implemented');
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

class FakeWebSocket {
  readyState = 1;
  messages: Array<Record<string, unknown>> = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data) as Record<string, unknown>);
  }
}

async function waitFor(assertion: () => void, timeoutMs = 2000): Promise<void> {
  const startedAt = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) {
        throw error;
      }
      await Bun.sleep(10);
    }
  }
}

describe('CozyBaseSession', () => {
  let handle: TestWorkspaceHandle | null = null;

  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  test('processes multiple conversations within one lifecycle and queues follow-up inputs', async () => {
    handle = createTestWorkspace();
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    const eventBus = new EventBus();
    const firstQuery = new DeferredAgentQuery();
    const provider = new StubAgentProvider(() => {
      if (provider.prompts.length === 1) {
        return firstQuery;
      }

      const prompt = provider.prompts.at(-1) ?? '';
      return {
        async interrupt() {},
        close() {},
        async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
          yield { type: 'conversation.run.started' };
          yield {
            type: 'conversation.message.completed',
            messageId: crypto.randomUUID(),
            role: 'assistant',
            content: `reply:${prompt}`,
          };
          yield { type: 'conversation.run.completed', sessionId: `resume-${provider.prompts.length}` };
        },
      };
    });

    const tasks = new Map<string, DelegatedTask>();
    const session = new CozyBaseSession({
      runtimeStore,
      runtimeResolver: () => ({ agentProvider: provider, providerKind: 'claude-code', model: 'test-model' }),
      providerOptionsResolver: async () => ({}),
      eventBus,
      cwd: handle.root,
      getTask: (taskId) => tasks.get(taskId) ?? null,
    });
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.prompt('build app');
    await waitFor(() => {
      expect(provider.prompts).toEqual(['build app']);
    });

    tasks.set('task-1', {
      taskId: 'task-1',
      appSlug: 'orders',
      target: 'builder',
      type: 'develop',
      instruction: 'do work',
      status: 'running',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    });
    session.registerDelegatedTask('task-1');
    eventBus.emit('task:completed', {
      taskId: 'task-1',
      appSlug: 'orders',
      summary: 'App build finished',
    });
    await session.prompt('show me the result');

    firstQuery.finish([
      {
        type: 'conversation.message.completed',
        messageId: 'assistant-1',
        role: 'assistant',
        content: 'builder task created',
      },
      { type: 'conversation.run.completed', sessionId: 'resume-1' },
    ]);

    await waitFor(() => {
      expect(provider.prompts).toEqual([
        'build app',
        '[系统通知] APP "orders" 的后台任务已完成：App build finished\n\n请将此结果告知用户。',
        'show me the result',
      ]);
    });
    await waitFor(() => {
      expect(ws.messages.at(-1)).toEqual({
        type: 'lifecycle.completed',
        lifecycleId: expect.any(String),
      });
    });

    const lifecycleStarts = ws.messages.filter((message) => message.type === 'lifecycle.started');
    const lifecycleCompletes = ws.messages.filter((message) => message.type === 'lifecycle.completed');
    expect(lifecycleStarts).toHaveLength(1);
    expect(lifecycleCompletes).toHaveLength(1);
  });

  test('polls pending tasks when terminal task events are missed', async () => {
    handle = createTestWorkspace();
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    const eventBus = new EventBus();
    const firstQuery = new DeferredAgentQuery();
    const provider = new StubAgentProvider(() => {
      if (provider.prompts.length === 1) {
        return firstQuery;
      }

      const prompt = provider.prompts.at(-1) ?? '';
      return {
        async interrupt() {},
        close() {},
        async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
          yield { type: 'conversation.run.started' };
          yield {
            type: 'conversation.message.completed',
            messageId: crypto.randomUUID(),
            role: 'assistant',
            content: `reply:${prompt}`,
          };
          yield { type: 'conversation.run.completed', sessionId: 'resume-polled' };
        },
      };
    });

    const tasks = new Map<string, DelegatedTask>();
    const session = new CozyBaseSession({
      runtimeStore,
      runtimeResolver: () => ({ agentProvider: provider, providerKind: 'claude-code', model: 'test-model' }),
      providerOptionsResolver: async () => ({}),
      eventBus,
      cwd: handle.root,
      getTask: (taskId) => tasks.get(taskId) ?? null,
    });
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.prompt('start background work');
    await waitFor(() => {
      expect(provider.prompts).toEqual(['start background work']);
    });

    tasks.set('task-1', {
      taskId: 'task-1',
      appSlug: 'orders',
      target: 'builder',
      type: 'develop',
      instruction: 'do work',
      status: 'running',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
    });
    session.registerDelegatedTask('task-1');

    firstQuery.finish([
      {
        type: 'conversation.message.completed',
        messageId: 'assistant-1',
        role: 'assistant',
        content: 'background task queued',
      },
      { type: 'conversation.run.completed', sessionId: 'resume-1' },
    ]);

    await Bun.sleep(50);
    expect(ws.messages.some((message) => message.type === 'lifecycle.completed')).toBe(false);

    tasks.set('task-1', {
      ...tasks.get('task-1')!,
      status: 'completed',
      completedAt: new Date().toISOString(),
      summary: 'Polled summary',
    });

    await waitFor(() => {
      expect(provider.prompts).toEqual([
        'start background work',
        '[系统通知] APP "orders" 的后台任务已完成：Polled summary\n\n请将此结果告知用户。',
      ]);
    }, 3000);
    await waitFor(() => {
      expect(ws.messages.at(-1)).toEqual({
        type: 'lifecycle.completed',
        lifecycleId: expect.any(String),
      });
    }, 3000);
  });
});
