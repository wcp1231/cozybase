import { afterEach, describe, expect, test } from 'bun:test';
import {
  type AgentEvent,
  type AgentProvider,
  type AgentProviderCapabilities,
  type AgentQuery,
  type AgentQueryConfig,
  type AgentRuntimeSession,
  type AgentSessionSpec,
} from '@cozybase/ai-runtime';
import { ChatSessionManager } from '../../src/ai/builder/session-manager';
import { RuntimeSessionStore } from '../../src/ai/runtime-session-store';
import { SessionStore } from '../../src/ai/builder/session-store';
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

class StubRuntimeProvider extends StubAgentProvider {
  constructor(readonly kind: 'claude' | 'codex') {
    super();
  }

  readonly capabilities: AgentProviderCapabilities = {
    toolModes: ['mcp', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: true,
    supportsContextTransform: false,
    supportsHistoryProjection: false,
  };

  async createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    return new StubRuntimeSession(this, this.kind, spec);
  }
}

class StubRuntimeSession implements AgentRuntimeSession {
  private resumeSessionId: string | null = null;
  private readonly listeners = new Set<(event: AgentEvent) => void>();

  constructor(
    private readonly provider: StubAgentProvider,
    private readonly providerKind: string,
    private readonly spec: AgentSessionSpec,
  ) {}

  async prompt(text: string): Promise<void> {
    const query = this.provider.createQuery({
      prompt: text,
      systemPrompt: this.spec.systemPrompt,
      cwd: this.spec.cwd ?? process.cwd(),
      model: typeof this.spec.model === 'string' ? this.spec.model : undefined,
      resumeSessionId: this.resumeSessionId,
      providerOptions: this.spec.providerOptions,
    });

    for await (const event of query) {
      if (event.type === 'conversation.run.completed' && event.sessionId) {
        this.resumeSessionId = event.sessionId;
      }
      for (const listener of this.listeners) {
        listener(event);
      }
    }
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async interrupt(): Promise<void> {}

  close(): void {}

  async exportSnapshot() {
    return this.resumeSessionId
      ? { providerKind: this.providerKind, version: 1, state: { resumeSessionId: this.resumeSessionId } }
      : null;
  }

  async restoreSnapshot(snapshot: { state?: { resumeSessionId?: unknown } }) {
    this.resumeSessionId = typeof snapshot.state?.resumeSessionId === 'string'
      ? snapshot.state.resumeSessionId
      : null;
  }

  async getHistory() {
    return [];
  }
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
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    runtimeStore.saveSession('builder', 'orders', 'claude', {
      providerKind: 'claude',
      version: 1,
      state: { resumeSessionId: 'sess-claude' },
    });

    const provider = new StubRuntimeProvider('codex');
    const manager = new ChatSessionManager(
      {
        agentProvider: provider,
        providerKind: 'codex',
        agentDir: handle.root,
      },
      store,
      runtimeStore,
    );

    const session = manager.getOrCreate('orders');
    await session.injectPrompt('hello');

    expect(provider.lastConfig?.resumeSessionId).toBeNull();
    expect(runtimeStore.getSession('builder', 'orders')).toBeNull();
  });

  test('reuses resume session when stored provider matches', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    runtimeStore.saveSession('builder', 'orders', 'claude', {
      providerKind: 'claude',
      version: 1,
      state: { resumeSessionId: 'thread-1' },
    });

    const provider = new StubRuntimeProvider('claude');
    const manager = new ChatSessionManager(
      {
        agentProvider: provider,
        providerKind: 'claude',
        agentDir: handle.root,
      },
      store,
      runtimeStore,
    );

    const session = manager.getOrCreate('orders');
    await session.injectPrompt('hello');

    expect(provider.lastConfig?.resumeSessionId).toBe('thread-1');
  });
});
