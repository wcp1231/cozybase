import { afterEach, describe, expect, mock, test } from 'bun:test';
import type {
  AgentEvent,
  AgentToolMode,
  AgentProviderCapabilities,
  AgentRuntimeProvider,
  AgentRuntimeSession,
  AgentSessionSpec,
  ProviderSessionSnapshot,
  StoredMessage,
} from '@cozybase/ai-runtime';
import { AppRegistry } from '@cozybase/runtime';
import { createTestApp, createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

const fakeBridge = {
  url: 'http://127.0.0.1/operator-test-mcp',
  bearerToken: 'test-operator-token',
  close: async () => {},
};

mock.module('../../src/mcp/http-bridge.ts', () => ({
  startInProcessMcpHttpBridge: async () => fakeBridge,
  startInProcessMcpHttpBridgeWithFactory: async () => fakeBridge,
}));

const { RuntimeSessionStore } = await import('../../src/ai/runtime-session-store');
const { OperatorSessionManager } = await import('../../src/ai/operator/session-manager');

class FakeWebSocket {
  readyState = 1;
  messages: unknown[] = [];

  send(data: string): void {
    this.messages.push(JSON.parse(data));
  }
}

type RecordRow = { id: string; name: string; status: string };

class StubOperatorRuntimeProvider implements AgentRuntimeProvider {
  readonly capabilities: AgentProviderCapabilities;
  private readonly createSessionDelay?: Promise<void>;

  constructor(
    readonly kind: 'pi-agent-core' | 'codex' | 'claude',
    toolModes: AgentToolMode[] = ['native', 'none'],
    options?: { createSessionDelay?: Promise<void> },
  ) {
    this.capabilities = {
      toolModes,
      supportsResume: true,
      supportsWorkingDirectory: false,
      supportsContextTransform: true,
      supportsHistoryProjection: true,
    };
    this.createSessionDelay = options?.createSessionDelay;
  }

  readonly specs: AgentSessionSpec[] = [];

  async createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    await this.createSessionDelay;
    this.specs.push(spec);
    return new StubOperatorRuntimeSession(this.kind, spec);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

class StubOperatorRuntimeSession implements AgentRuntimeSession {
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly history: StoredMessage[] = [];

  constructor(
    private readonly providerKind: string,
    private readonly spec: AgentSessionSpec,
  ) {}

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async prompt(text: string): Promise<void> {
    this.history.push({ role: 'user', content: text });
    this.emit({ type: 'conversation.run.started' });

    if (text.includes('列出')) {
      const toolUseId = 'tool-query-1';
      this.emit({ type: 'conversation.tool.started', toolUseId, toolName: 'query_data' });
      const result = await this.executeTool('query_data', { table: 'orders', limit: 20 });
      this.history.push({
        role: 'tool',
        toolName: 'query_data',
        status: 'done',
        summary: JSON.stringify(result),
      });
      this.emit({
        type: 'conversation.tool.completed',
        toolUseId,
        toolName: 'query_data',
        summary: JSON.stringify(result),
      });
      this.emitAssistant('msg-query-1', `共 ${(result as { records?: unknown[] }).records?.length ?? 0} 条记录`);
    } else if (text.includes('添加')) {
      const toolUseId = 'tool-create-1';
      this.emit({ type: 'conversation.tool.started', toolUseId, toolName: 'create_record' });
      const result = await this.executeTool('create_record', {
        table: 'orders',
        data: { name: '新订单', status: 'open' },
      });
      this.history.push({
        role: 'tool',
        toolName: 'create_record',
        status: 'done',
        summary: JSON.stringify(result),
      });
      this.emit({
        type: 'conversation.tool.completed',
        toolUseId,
        toolName: 'create_record',
        summary: JSON.stringify(result),
      });
      this.emitAssistant('msg-create-1', '已添加新记录');
    } else {
      this.emitAssistant('msg-default-1', '未执行任何操作');
    }

    this.emit({ type: 'conversation.run.completed', sessionId: `${this.providerKind}-session-1` });
  }

  async interrupt(): Promise<void> {}

  close(): void {}

  async exportSnapshot(): Promise<ProviderSessionSnapshot | null> {
    return {
      providerKind: this.providerKind,
      version: 1,
      state: {
        history: this.history,
      },
    };
  }

  async restoreSnapshot(snapshot: ProviderSessionSnapshot): Promise<void> {
    const restored = (snapshot.state as { history?: StoredMessage[] } | undefined)?.history;
    this.history.length = 0;
    if (Array.isArray(restored)) {
      this.history.push(...restored);
    }
  }

  async getHistory(): Promise<StoredMessage[]> {
    return [...this.history];
  }

  private async executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.spec.toolMode === 'native') {
      const tools = Array.isArray(this.spec.nativeTools) ? this.spec.nativeTools as Array<{
        name: string;
        execute(input: unknown): Promise<unknown>;
      }> : [];
      const tool = tools.find((entry) => entry.name === name);
      return tool ? await tool.execute(args) : {};
    }

    if (this.spec.toolMode === 'mcp') {
      return callMcpTool(this.spec.mcpConfig, name, args);
    }

    return {};
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private emitAssistant(messageId: string, content: string): void {
    this.emit({ type: 'conversation.message.started', messageId, role: 'assistant' });
    this.emit({ type: 'conversation.message.delta', messageId, role: 'assistant', delta: content });
    this.emit({ type: 'conversation.message.completed', messageId, role: 'assistant', content });
    this.history.push({ role: 'assistant', content });
  }
}

async function callMcpTool(
  config: unknown,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (name === 'query_data') {
    return {
      records: [
        { id: '1', name: 'Alpha', status: 'open' },
        { id: '2', name: 'Beta', status: 'done' },
      ].slice(0, Number(args.limit ?? 20)),
    };
  }

  if (name === 'create_record') {
    return {
      record: {
        id: '3',
        ...(args.data as Record<string, unknown> | undefined),
      },
    };
  }

  return {};
}

function extractCodexMcpEndpoint(config: unknown): { url: string; headers: Record<string, string> } | null {
  if (config && typeof config === 'object') {
    const codexServer = (config as {
      codexConfig?: {
        mcp_servers?: Record<string, {
          url?: string;
          http_headers?: Record<string, string>;
        }>;
      };
    }).codexConfig?.mcp_servers?.operator;
    if (codexServer?.url) {
      expect(codexServer.http_headers?.Authorization).toBe(`Bearer ${fakeBridge.bearerToken}`);
      return {
        url: codexServer.url,
        headers: codexServer.http_headers ?? {},
      };
    }
  }
  return null;
}

function extractCodexMcpServerConfig(config: unknown): Record<string, unknown> | null {
  if (!config || typeof config !== 'object') {
    return null;
  }
  return (config as {
    codexConfig?: {
      mcp_servers?: Record<string, Record<string, unknown>>;
    };
  }).codexConfig?.mcp_servers?.operator ?? null;
}

function createRuntimeResolver(
  provider: StubOperatorRuntimeProvider,
  providerKind: 'pi-agent-core' | 'codex' | 'claude-code',
  model: unknown,
  toolMode: 'native' | 'mcp',
) {
  return () => ({
    agentProvider: provider,
    providerKind,
    model,
    toolMode,
    getApiKey: providerKind === 'pi-agent-core' ? () => 'test-key' : undefined,
  });
}

function createStablePlatformClient(records: RecordRow[]) {
  return {
    async call(_target: string, path: string, options?: RequestInit): Promise<Response> {
      const url = new URL(`http://localhost/${path}`);

      if (url.pathname === '/_db/schemas') {
        return jsonResponse({
          data: {
            orders: {
              columns: [
                { name: 'id', type: 'TEXT', pk: 1, notnull: 1 },
                { name: 'name', type: 'TEXT', pk: 0, notnull: 1 },
                { name: 'status', type: 'TEXT', pk: 0, notnull: 1 },
              ],
            },
          },
        });
      }

      if (url.pathname === '/_db/tables/orders' && (options?.method ?? 'GET') === 'GET') {
        const limit = Number(url.searchParams.get('limit') ?? records.length);
        return jsonResponse({ data: records.slice(0, limit) });
      }

      if (url.pathname === '/_db/tables/orders' && options?.method === 'POST') {
        const payload = options.body ? JSON.parse(String(options.body)) as Omit<RecordRow, 'id'> : { name: '', status: '' };
        const record = { id: String(records.length + 1), ...payload };
        records.push(record);
        return jsonResponse({ data: record }, 201);
      }

      return jsonResponse({ error: { message: `Unhandled path ${url.pathname}` } }, 404);
    },
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createRegistry(handle: TestWorkspaceHandle, appSlug: string): AppRegistry {
  const registry = new AppRegistry();
  const app = handle.workspace.getOrCreateApp(appSlug);
  registry.start(appSlug, {
    mode: 'stable',
    dbPath: app.stableDbPath,
    functionsDir: app.stableFunctionsDir,
    uiDir: app.stableUiDir,
  });
  return registry;
}

function markAppPublished(handle: TestWorkspaceHandle, appSlug: string): void {
  handle.workspace.getPlatformDb().query(`
    UPDATE apps
    SET published_version = current_version, stable_status = 'running'
    WHERE slug = ?
  `).run(appSlug);
  handle.workspace.refreshAppState(appSlug);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('OperatorSessionManager', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    delete process.env.COZYBASE_OPERATOR_DISABLE_TOOLS;
    handle?.cleanup();
  });

  test('queries records through operator websocket flow and emits history/events', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
      functions: {
        'adjust-inventory.ts': 'export const POST = async () => new Response("ok");',
      },
    });
    markAppPublished(handle, 'orders');

    const records: RecordRow[] = [
      { id: '1', name: 'Alpha', status: 'open' },
      { id: '2', name: 'Beta', status: 'done' },
    ];
    const provider = new StubOperatorRuntimeProvider('pi-agent-core');
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient(records) as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(
        provider,
        'pi-agent-core',
        { provider: 'anthropic', id: 'claude-sonnet-4-20250514' },
        'native',
      ),
    });

    const session = await manager.getOrCreate('orders');
    const ws = new FakeWebSocket();
    await session.connect(ws as any);
    await session.handleMessage(ws as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'session.connected', hasSession: false }));
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.tool.started', toolName: 'query_data' }));
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '共 2 条记录' }));
    expect(provider.specs[0]?.nativeTools).toBeArray();
  });

  test('restores operator history from snapshot after reconnect and session recreation', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const records: RecordRow[] = [{ id: '1', name: 'Alpha', status: 'open' }];
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    const provider = new StubOperatorRuntimeProvider('pi-agent-core');
    const config = {
      workspace: handle.workspace,
      agentDir: '/tmp/cozybase-operator-agent',
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient(records) as any,
      runtimeStore,
      runtimeResolver: createRuntimeResolver(
        provider,
        'pi-agent-core',
        { provider: 'anthropic', id: 'claude-sonnet-4-20250514' },
        'native',
      ),
    };

    const manager = new OperatorSessionManager(config);
    const firstSession = await manager.getOrCreate('orders');
    const firstWs = new FakeWebSocket();
    await firstSession.connect(firstWs as any);
    await firstSession.handleMessage(firstWs as any, JSON.stringify({ type: 'prompt', text: '添加一条新记录' }));

    manager.shutdown();

    const secondManager = new OperatorSessionManager(config);
    const secondSession = await secondManager.getOrCreate('orders');
    const secondWs = new FakeWebSocket();
    await secondSession.connect(secondWs as any);

    expect(secondWs.messages).toContainEqual(expect.objectContaining({
      type: 'session.history',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '添加一条新记录' }),
        expect.objectContaining({ role: 'assistant', content: '已添加新记录' }),
      ]),
    }));
  });

  test('uses updated model for newly created operator sessions', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders-a', {
      spec: { description: 'A', stable_status: 'running' },
    });
    createTestApp(handle, 'orders-b', {
      spec: { description: 'B', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders-a');
    markAppPublished(handle, 'orders-b');

    const records: RecordRow[] = [];
    const provider = new StubOperatorRuntimeProvider('pi-agent-core');
    let currentModel = { provider: 'anthropic', id: 'claude-sonnet-4-20250514' };

    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: (() => {
        const registry = createRegistry(handle, 'orders-a');
        const appB = handle.workspace.getOrCreateApp('orders-b');
        registry.start('orders-b', {
          mode: 'stable',
          dbPath: appB.stableDbPath,
          functionsDir: appB.stableFunctionsDir,
          uiDir: appB.stableUiDir,
        });
        return registry;
      })(),
      stablePlatformClient: createStablePlatformClient(records) as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: () => ({
        ...createRuntimeResolver(provider, 'pi-agent-core', currentModel, 'native')(),
      }),
    });

    const sessionA = await manager.getOrCreate('orders-a');
    const wsA = new FakeWebSocket();
    sessionA.connect(wsA as any);
    await sessionA.handleMessage(wsA as any, JSON.stringify({ type: 'prompt', text: '你好 A' }));
    currentModel = { provider: 'openai', id: 'gpt-4o-mini' };
    const sessionB = await manager.getOrCreate('orders-b');
    const wsB = new FakeWebSocket();
    sessionB.connect(wsB as any);
    await sessionB.handleMessage(wsB as any, JSON.stringify({ type: 'prompt', text: '你好 B' }));

    expect(provider.specs[0]?.model).toEqual({ provider: 'anthropic', id: 'claude-sonnet-4-20250514' });
    expect(provider.specs[1]?.model).toEqual({ provider: 'openai', id: 'gpt-4o-mini' });
  });

  test('uses MCP tool mode for codex operator sessions and restores history from snapshot', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const records: RecordRow[] = [
      { id: '1', name: 'Alpha', status: 'open' },
      { id: '2', name: 'Beta', status: 'done' },
    ];
    const runtimeStore = new RuntimeSessionStore(handle.workspace.getPlatformDb());
    const provider = new StubOperatorRuntimeProvider('codex', ['mcp', 'none']);
    const config = {
      workspace: handle.workspace,
      workspaceDir: handle.workspace.root,
      agentDir: '/tmp/cozybase-operator-agent',
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient(records) as any,
      runtimeStore,
      runtimeResolver: createRuntimeResolver(provider, 'codex', 'gpt-5.4', 'mcp'),
    };

    const manager = new OperatorSessionManager(config);
    const firstSession = await manager.getOrCreate('orders');
    const firstWs = new FakeWebSocket();
    await firstSession.connect(firstWs as any);
    await firstSession.handleMessage(firstWs as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    expect(provider.specs[0]?.toolMode).toBe('mcp');
    expect(provider.specs[0]?.cwd).toBe('/tmp/cozybase-operator-agent');
    expect(provider.specs[0]?.nativeTools).toBeUndefined();
    expect((provider.specs[0]?.providerOptions as any)?.codexConfig?.sandbox_mode).toBe('workspace-write');
    expect((extractCodexMcpServerConfig(provider.specs[0]?.providerOptions) as any)?.type).toBe('stdio');
    expect((extractCodexMcpServerConfig(provider.specs[0]?.providerOptions) as any)?.args).toEqual(expect.arrayContaining(['operator-mcp', '--app', 'orders']));
    expect(firstWs.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '共 2 条记录' }));

    manager.shutdown();

    const secondManager = new OperatorSessionManager(config);
    const secondSession = await secondManager.getOrCreate('orders');
    const secondWs = new FakeWebSocket();
    await secondSession.connect(secondWs as any);

    expect(secondWs.messages).toContainEqual(expect.objectContaining({
      type: 'session.history',
      messages: expect.arrayContaining([
        expect.objectContaining({ role: 'user', content: '列出所有记录' }),
        expect.objectContaining({ role: 'assistant', content: '共 2 条记录' }),
      ]),
    }));
  });

  test('uses MCP tool mode for claude-code operator sessions and executes query flow', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const records: RecordRow[] = [
      { id: '1', name: 'Alpha', status: 'open' },
      { id: '2', name: 'Beta', status: 'done' },
    ];
    const provider = new StubOperatorRuntimeProvider('claude', ['mcp', 'none']);
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient(records) as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(provider, 'claude-code', 'claude-sonnet-4-6', 'mcp'),
    });

    const session = await manager.getOrCreate('orders');
    const ws = new FakeWebSocket();
    await session.connect(ws as any);
    await session.handleMessage(ws as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    expect(provider.specs[0]?.toolMode).toBe('mcp');
    expect(provider.specs[0]?.model).toBe('claude-sonnet-4-6');
    expect((provider.specs[0]?.providerOptions as any)?.mcpServers?.operator).toBeTruthy();
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.tool.started', toolName: 'query_data' }));
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '共 2 条记录' }));
  });

  test('defers operator app-context loading and runtime creation until first prompt', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    let schemaCalls = 0;
    const stablePlatformClient = {
      async call(_target: string, path: string, options?: RequestInit): Promise<Response> {
        const url = new URL(`http://localhost/${path}`);
        if (url.pathname === '/_db/schemas') {
          schemaCalls += 1;
        }
        return createStablePlatformClient([]).call(_target, path, options);
      },
    };
    const provider = new StubOperatorRuntimeProvider('pi-agent-core');
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: stablePlatformClient as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(
        provider,
        'pi-agent-core',
        { provider: 'anthropic', id: 'claude-sonnet-4-20250514' },
        'native',
      ),
    });

    const session = manager.getOrCreate('orders');
    const ws = new FakeWebSocket();
    session.connect(ws as any);

    expect(schemaCalls).toBe(0);
    expect(provider.specs).toHaveLength(0);
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'session.connected', hasSession: false }));

    await session.handleMessage(ws as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    expect(schemaCalls).toBe(1);
    expect(provider.specs).toHaveLength(1);
  });

  test('reuses a single runtime session across reconnect before first prompt', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const createSessionGate = createDeferred<void>();
    const provider = new StubOperatorRuntimeProvider(
      'codex',
      ['mcp', 'none'],
      { createSessionDelay: createSessionGate.promise },
    );
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient([
        { id: '1', name: 'Alpha', status: 'open' },
        { id: '2', name: 'Beta', status: 'done' },
      ]) as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(provider, 'codex', 'gpt-5.4', 'mcp'),
    });

    const session = await manager.getOrCreate('orders');
    const firstWs = new FakeWebSocket();
    session.connect(firstWs as any);
    session.disconnect(firstWs as any);

    const secondWs = new FakeWebSocket();
    session.connect(secondWs as any);
    const promptPromise = session.handleMessage(secondWs as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    createSessionGate.resolve();
    await promptPromise;

    expect(provider.specs).toHaveLength(1);
    expect(secondWs.messages).toContainEqual(expect.objectContaining({ type: 'session.connected', hasSession: false }));
    expect(secondWs.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '共 2 条记录' }));
  });

  test('streams operator replies even if first prompt arrives before connect', async () => {
    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const provider = new StubOperatorRuntimeProvider('codex', ['mcp', 'none']);
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: createStablePlatformClient([
        { id: '1', name: 'Alpha', status: 'open' },
        { id: '2', name: 'Beta', status: 'done' },
      ]) as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(provider, 'codex', 'gpt-5.4', 'mcp'),
    });

    const session = await manager.getOrCreate('orders');
    const ws = new FakeWebSocket();
    await session.handleMessage(ws as any, JSON.stringify({ type: 'prompt', text: '列出所有记录' }));

    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.run.started' }));
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '共 2 条记录' }));
  });

  test('can force operator sessions into tool-free mode for plain dialogue debugging', async () => {
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS = '1';

    handle = createTestWorkspace();
    createTestApp(handle, 'orders', {
      spec: { description: 'Order tracker', stable_status: 'running' },
    });
    markAppPublished(handle, 'orders');

    const provider = new StubOperatorRuntimeProvider('codex', ['mcp', 'none']);
    let schemaCalls = 0;
    const stablePlatformClient = {
      async call(target: string, path: string, options?: RequestInit): Promise<Response> {
        if (path === '_db/schemas') {
          schemaCalls += 1;
        }
        return createStablePlatformClient([
          { id: '1', name: 'Alpha', status: 'open' },
        ]).call(target, path, options);
      },
    };
    const manager = new OperatorSessionManager({
      workspace: handle.workspace,
      registry: createRegistry(handle, 'orders'),
      stablePlatformClient: stablePlatformClient as any,
      runtimeStore: new RuntimeSessionStore(handle.workspace.getPlatformDb()),
      runtimeResolver: createRuntimeResolver(provider, 'codex', 'gpt-5.4', 'mcp'),
    });

    const session = await manager.getOrCreate('orders');
    const ws = new FakeWebSocket();
    await session.connect(ws as any);
    await session.handleMessage(ws as any, JSON.stringify({ type: 'prompt', text: '你好' }));

    expect(provider.specs[0]?.toolMode).toBe('none');
    expect(provider.specs[0]?.mcpConfig).toBeUndefined();
    expect(provider.specs[0]?.nativeTools).toBeUndefined();
    expect(schemaCalls).toBe(0);
    expect(ws.messages).toContainEqual(expect.objectContaining({ type: 'conversation.message.completed', content: '未执行任何操作' }));
  });

});
