import { afterEach, describe, expect, test } from 'bun:test';
import type { AgentEvent, AgentProvider, AgentQuery, AgentQueryConfig } from '@cozybase/agent';
import { ChatSessionManager } from '../../src/agent/chat-session-manager';
import { SessionStore } from '../../src/agent/session-store';
import { createTestApp, createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

class StubAgentQuery implements AgentQuery {
  constructor(private readonly events: AgentEvent[]) {}

  async interrupt(): Promise<void> {}
  close(): void {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    for (const event of this.events) {
      yield event;
    }
  }
}

class StubAgentProvider implements AgentProvider {
  public lastConfig: AgentQueryConfig | null = null;

  createQuery(config: AgentQueryConfig): AgentQuery {
    this.lastConfig = config;
    return new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: '' },
    ]);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

describe('ChatSessionManager provider-aware resume', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  test('clears stale resume session when stored provider differs', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    store.saveSessionId('orders', 'sess-claude', 'claude');

    const provider = new StubAgentProvider();
    const manager = new ChatSessionManager(
      {
        agentProvider: provider,
        providerKind: 'codex',
        agentDir: handle.root,
      },
      store,
    );

    const session = manager.getOrCreate('orders');
    await session.injectPrompt('hello');

    expect(provider.lastConfig?.resumeSessionId).toBeNull();
    expect(store.getSession('orders')?.sdkSessionId).toBeNull();
    expect(store.getSession('orders')?.providerKind).toBeNull();
  });

  test('reuses resume session when stored provider matches', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    store.saveSessionId('orders', 'thread-1', 'codex');

    const provider = new StubAgentProvider();
    const manager = new ChatSessionManager(
      {
        agentProvider: provider,
        providerKind: 'codex',
        agentDir: handle.root,
      },
      store,
    );

    const session = manager.getOrCreate('orders');
    await session.injectPrompt('hello');

    expect(provider.lastConfig?.resumeSessionId).toBe('thread-1');
  });
});

