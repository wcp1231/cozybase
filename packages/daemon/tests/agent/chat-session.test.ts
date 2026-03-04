import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentEvent, AgentProvider, AgentQuery, AgentQueryConfig } from '@cozybase/agent';
import { ChatSession } from '../../src/agent/chat-session';
import { SessionStore } from '../../src/agent/session-store';
import { createTestApp, createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

class StubAgentQuery implements AgentQuery {
  constructor(
    private readonly events: AgentEvent[],
    private readonly interruptFn: () => Promise<void> = async () => {},
  ) {}

  async interrupt(): Promise<void> {
    await this.interruptFn();
  }

  close(): void {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    for (const event of this.events) {
      yield event;
    }
  }
}

class StubAgentProvider implements AgentProvider {
  public lastConfig: AgentQueryConfig | null = null;

  constructor(private readonly queryFactory: () => AgentQuery) {}

  createQuery(config: AgentQueryConfig): AgentQuery {
    this.lastConfig = config;
    return this.queryFactory();
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

class FakeWebSocket {
  readyState = 1;
  messages: unknown[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data));
  }
}

describe('ChatSession', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  test('keeps the persisted session id when a run completes with an empty sessionId', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    store.saveSessionId('orders', 'sess-existing');

    const provider = new StubAgentProvider(() => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: '' },
    ]));

    const session = new ChatSession(
      'orders',
      {
        agentProvider: provider,
        agentDir: handle.root,
      },
      store,
      'sess-existing',
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    expect(store.getSessionId('orders')).toBe('sess-existing');
    expect(provider.lastConfig?.resumeSessionId).toBe('sess-existing');
    expect(ws.messages).toContainEqual({ type: 'conversation.run.completed', sessionId: '' });
  });
});
