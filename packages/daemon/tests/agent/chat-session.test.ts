import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'fs';
import {
  type AgentEvent,
  type AgentProvider,
  type AgentProviderCapabilities,
  type AgentQuery,
  type AgentQueryConfig,
  type AgentRuntimeSession,
  type AgentSessionSpec,
} from '@cozybase/ai-runtime';
import { ChatSession } from '../../src/ai/builder/session';
import { RuntimeSessionStore } from '../../src/ai/runtime-session-store';
import { SessionStore } from '../../src/ai/builder/session-store';
import { daemonLogger } from '../../src/core/daemon-logger';
import { resolveDaemonLogFilePath } from '../../src/runtime-paths';
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

class StubRuntimeProvider extends StubAgentProvider {
  constructor(
    private readonly runtimeKind: 'claude' | 'codex',
    queryFactory: () => AgentQuery,
  ) {
    super(queryFactory);
  }

  get kind() {
    return this.runtimeKind;
  }

  readonly capabilities: AgentProviderCapabilities = {
    toolModes: ['mcp', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: true,
    supportsContextTransform: false,
    supportsHistoryProjection: false,
  };

  async createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    return new StubRuntimeSession(this, this.runtimeKind, spec);
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

class FakeWebSocket {
  readyState = 1;
  messages: unknown[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data));
  }
}

describe('ChatSession', () => {
  let handle: TestWorkspaceHandle;
  let previousHome: string | undefined;

  afterEach(() => {
    process.env.HOME = previousHome;
    handle?.cleanup();
  });

  test('keeps the persisted session id when a run completes with an empty sessionId', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    runtimeStore.saveSession('builder', 'orders', 'claude', {
      providerKind: 'claude',
      version: 1,
      state: { resumeSessionId: 'sess-existing' },
    });

    const provider = new StubRuntimeProvider('claude', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: '' },
    ]));

    const session = new ChatSession(
      'orders',
      {
        agentProvider: provider,
        providerKind: 'claude',
        agentDir: handle.root,
      },
      store,
      runtimeStore,
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    expect(runtimeStore.getSession('builder', 'orders')?.snapshot).toEqual({
      providerKind: 'claude',
      version: 1,
      state: { resumeSessionId: 'sess-existing' },
    });
    expect(provider.lastConfig?.resumeSessionId).toBe('sess-existing');
    expect(ws.messages).toContainEqual({ type: 'conversation.run.completed', sessionId: '' });
  });

  test('restores tool history in started-time order even when completion arrives later', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());

    const provider = new StubRuntimeProvider('claude', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.tool.started', toolUseId: 'tool-1', toolName: 'Read' },
      { type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' },
      { type: 'conversation.message.completed', messageId: 'm-1', role: 'assistant', content: 'done' },
      { type: 'conversation.tool.completed', toolUseId: 'tool-1', toolName: 'Read', summary: 'read files' },
      { type: 'conversation.run.completed', sessionId: 'sess-1' },
    ]));

    const session = new ChatSession(
      'orders',
      {
        agentProvider: provider,
        providerKind: 'claude',
        agentDir: handle.root,
      },
      store,
      runtimeStore,
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    const history = store.getMessages('orders');
    expect(history).toEqual([
      expect.objectContaining({ role: 'user', content: 'hello' }),
      expect.objectContaining({
        role: 'tool',
        content: '',
        toolName: 'Read',
        toolStatus: 'done',
        toolSummary: 'read files',
      }),
      expect.objectContaining({ role: 'assistant', content: 'done' }),
    ]);
  });

  test('passes provider options generated by providerOptionsFactory', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());

    const provider = new StubRuntimeProvider('claude', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: 'sess-1' },
    ]));

    const session = new ChatSession(
      'orders',
      {
        agentProvider: provider,
        providerKind: 'claude',
        agentDir: handle.root,
        providerOptionsFactory: ({ appSlug, mode }) => ({
          marker: `${appSlug}:${mode}`,
        }),
      },
      store,
      runtimeStore,
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    expect(provider.lastConfig?.providerOptions).toEqual({ marker: 'orders:chat' });
  });

  test('uses the latest runtime resolver values for provider, model, and resume clearing', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    runtimeStore.saveSession('builder', 'orders', 'claude', {
      providerKind: 'claude',
      version: 1,
      state: { resumeSessionId: 'sess-claude' },
    });

    const claudeProvider = new StubRuntimeProvider('claude', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: 'sess-claude-next' },
    ]));
    const codexProvider = new StubRuntimeProvider('codex', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: 'thread-codex-1' },
    ]));

    let providerKind: 'claude' | 'codex' = 'codex';

    const session = new ChatSession(
      'orders',
      {
        agentProvider: claudeProvider,
        providerKind: 'claude',
        agentDir: handle.root,
        runtimeResolver: () => (
          providerKind === 'claude'
            ? {
                agentProvider: claudeProvider,
                providerKind: 'claude',
                model: 'claude-opus-4-6',
              }
            : {
                agentProvider: codexProvider,
                providerKind: 'codex',
                model: 'gpt-5.4',
              }
        ),
      },
      store,
      runtimeStore,
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    expect(claudeProvider.lastConfig).toBeNull();
    expect(codexProvider.lastConfig?.model).toBe('gpt-5.4');
    expect(codexProvider.lastConfig?.resumeSessionId).toBeNull();
    expect(runtimeStore.getSession('builder', 'orders')).toEqual({
      providerKind: 'codex',
      snapshot: {
        providerKind: 'codex',
        version: 1,
        state: { resumeSessionId: 'thread-codex-1' },
      },
    });
  });

  test('writes builder MCP debug trace when MCP usage fails', async () => {
    handle = createTestWorkspace();
    previousHome = process.env.HOME;
    process.env.HOME = handle.root;
    createTestApp(handle, 'orders');
    const store = new SessionStore(handle.workspace.getPlatformDb());
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    handle.workspace.getPlatformRepo().settings.set('daemon.log_level', 'DEBUG');
    daemonLogger.configure(handle.workspace.getPlatformRepo());

    const provider = new StubRuntimeProvider('codex', () => new StubAgentQuery([
      { type: 'conversation.run.started' },
      {
        type: 'conversation.tool.started',
        toolUseId: 'tool-1',
        toolName: 'cozybase.create_app',
        input: { app_name: 'orders' },
      },
      {
        type: 'conversation.tool.completed',
        toolUseId: 'tool-1',
        toolName: 'cozybase.create_app',
        summary: 'failed: request timeout',
      },
      { type: 'conversation.error', message: 'Codex turn failed' },
    ]));

    const session = new ChatSession(
      'orders',
      {
        agentProvider: provider,
        providerKind: 'codex',
        agentDir: handle.root,
      },
      store,
      runtimeStore,
    );
    const ws = new FakeWebSocket();
    session.connect(ws);

    await session.handleMessage(ws, JSON.stringify({ type: 'chat:send', message: 'hello' }));

    const logPath = resolveDaemonLogFilePath();
    expect(existsSync(logPath)).toBeTrue();
    const content = readFileSync(logPath, 'utf-8');
    expect(content).toContain('Builder MCP failure trace app=orders provider=codex');
    expect(content).toContain('"toolName":"cozybase.create_app"');
    expect(content).toContain('"summary":"failed: request timeout"');
    expect(content).toContain('"message":"Codex turn failed"');
  });
});
