import { describe, expect, test } from 'bun:test';
import type { SessionNotification } from '@agentclientprotocol/sdk';
import { CozyBaseAcpServer, buildCozyBaseWebSocketUrl } from '../../src/acp/acp-server';
import type {
  CozyBaseBridgeSocket,
  SocketCloseEventLike,
  SocketErrorEventLike,
  SocketMessageEventLike,
  SocketOpenEventLike,
} from '../../src/acp/types';

type ListenerMap = {
  open: Array<(event: SocketOpenEventLike) => void>;
  message: Array<(event: SocketMessageEventLike) => void>;
  close: Array<(event: SocketCloseEventLike) => void>;
  error: Array<(event: SocketErrorEventLike) => void>;
};

class FakeBridgeSocket implements CozyBaseBridgeSocket {
  readyState = 0;
  sent: string[] = [];
  readonly listeners: ListenerMap = {
    open: [],
    message: [],
    close: [],
    error: [],
  };

  constructor(private readonly autoOpen = true) {
    if (autoOpen) {
      queueMicrotask(() => {
        this.readyState = 1;
        this.emit('open', { type: 'open' });
      });
    }
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.emit('close', { type: 'close', code, reason });
  }

  addEventListener(type: keyof ListenerMap, listener: ListenerMap[keyof ListenerMap][number]): void {
    this.listeners[type].push(listener as never);
  }

  receive(payload: unknown): void {
    this.emit('message', { type: 'message', data: JSON.stringify(payload) });
  }

  fail(message = 'socket error'): void {
    this.emit('error', { type: 'error', message });
  }

  open(): void {
    this.readyState = 1;
    this.emit('open', { type: 'open' });
  }

  private emit<T extends keyof ListenerMap>(type: T, event: Parameters<ListenerMap[T][number]>[0]): void {
    for (const listener of this.listeners[type]) {
      listener(event as never);
    }
  }
}

function createConnectionCollector() {
  const notifications: SessionNotification[] = [];
  const controller = new AbortController();

  return {
    connection: {
      signal: controller.signal,
      async sessionUpdate(notification: SessionNotification) {
        notifications.push(notification);
      },
    },
    notifications,
    controller,
  };
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Bun.sleep(0);
}

describe('CozyBaseAcpServer', () => {
  test('initializes with protocol version and advertised capabilities', async () => {
    const { connection } = createConnectionCollector();
    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => new FakeBridgeSocket(),
      version: '1.2.3',
    });

    await expect(server.initialize({
      protocolVersion: 1,
      clientCapabilities: {},
    })).resolves.toMatchObject({
      protocolVersion: 1,
      agentInfo: {
        name: 'cozybase',
        version: '1.2.3',
      },
      agentCapabilities: {
        loadSession: false,
      },
    });
  });

  test('bridges a prompt lifecycle from ACP to CozyBase websocket events', async () => {
    const { connection, notifications } = createConnectionCollector();
    const sockets: FakeBridgeSocket[] = [];
    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787/',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => {
        const socket = new FakeBridgeSocket();
        sockets.push(socket);
        return socket;
      },
    });

    const { sessionId } = await server.newSession({
      cwd: '/tmp/workspace',
      mcpServers: [],
    });
    const socket = sockets[0];

    const promptPromise = server.prompt({
      sessionId,
      messageId: '3c20b4f6-1007-42d0-b7b8-e6d2d2663d45',
      prompt: [
        { type: 'text', text: 'Open the homepage implementation.' },
        { type: 'resource_link', uri: 'file:///tmp/workspace/README.md' },
      ],
    });

    await flushAsyncWork();
    expect(socket.sent.map((entry) => JSON.parse(entry))).toContainEqual({
      type: 'chat:send',
      message: 'Open the homepage implementation.\n\nfile:///tmp/workspace/README.md',
    });

    socket.receive({ type: 'lifecycle.started', lifecycleId: 'lifecycle-1' });
    socket.receive({ type: 'conversation.run.started' });
    socket.receive({ type: 'conversation.message.started', messageId: 'assistant-1', role: 'assistant' });
    socket.receive({ type: 'conversation.message.delta', messageId: 'assistant-1', role: 'assistant', delta: 'Working on it.' });
    socket.receive({ type: 'conversation.tool.started', toolUseId: 'tool-1', toolName: 'develop_app' });
    socket.receive({ type: 'conversation.tool.completed', toolUseId: 'tool-1', toolName: 'develop_app', summary: 'Patch applied.' });
    socket.receive({ type: 'conversation.run.completed', sessionId: 'resume-123' });
    socket.receive({ type: 'lifecycle.completed', lifecycleId: 'lifecycle-1' });

    await expect(promptPromise).resolves.toEqual({
      stopReason: 'end_turn',
      userMessageId: '3c20b4f6-1007-42d0-b7b8-e6d2d2663d45',
    });

    await flushAsyncWork();
    expect(notifications.map((notification) => notification.update.sessionUpdate)).toEqual([
      'agent_message_chunk',
      'tool_call',
      'tool_call_update',
    ]);

    socket.receive({ type: 'conversation.notice', message: 'App build completed in the background.' });
    await flushAsyncWork();
    expect(notifications.at(-1)).toMatchObject({
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text: 'App build completed in the background.' },
      },
    });
  });

  test('cancels an active prompt and returns cancelled once the run completes', async () => {
    const { connection } = createConnectionCollector();
    const socket = new FakeBridgeSocket();
    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => socket,
    });

    const { sessionId } = await server.newSession({
      cwd: '/tmp/workspace',
      mcpServers: [],
    });
    const promptPromise = server.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'Cancel this request.' }],
    });

    await flushAsyncWork();
    await server.cancel({ sessionId });
    expect(socket.sent.map((entry) => JSON.parse(entry))).toContainEqual({ type: 'chat:cancel' });

    socket.receive({ type: 'lifecycle.started', lifecycleId: 'lifecycle-1' });
    socket.receive({ type: 'conversation.run.completed', sessionId: 'resume-456' });
    socket.receive({ type: 'lifecycle.completed', lifecycleId: 'lifecycle-1' });
    await expect(promptPromise).resolves.toEqual({
      stopReason: 'cancelled',
      userMessageId: null,
    });
  });

  test('rejects prompt requests for unknown sessions and websocket-side failures', async () => {
    const { connection } = createConnectionCollector();
    const socket = new FakeBridgeSocket();
    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => socket,
    });

    await expect(server.prompt({
      sessionId: 'missing-session',
      prompt: [{ type: 'text', text: 'Hello' }],
    })).rejects.toThrow("Unknown session 'missing-session'");

    const { sessionId } = await server.newSession({
      cwd: '/tmp/workspace',
      mcpServers: [],
    });
    const promptPromise = server.prompt({
      sessionId,
      prompt: [{ type: 'text', text: 'Trigger an error.' }],
    });

    await flushAsyncWork();
    socket.receive({ type: 'lifecycle.started', lifecycleId: 'lifecycle-1' });
    socket.receive({ type: 'conversation.error', message: 'provider failed' });
    socket.receive({ type: 'lifecycle.failed', lifecycleId: 'lifecycle-1', message: 'provider failed' });
    await expect(promptPromise).rejects.toThrow('provider failed');
  });

  test('resolves all waiters attached to the same lifecycle', async () => {
    const { connection } = createConnectionCollector();
    const socket = new FakeBridgeSocket();
    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => socket,
    });

    const { sessionId } = await server.newSession({
      cwd: '/tmp/workspace',
      mcpServers: [],
    });

    const firstPrompt = server.prompt({
      sessionId,
      messageId: 'message-1',
      prompt: [{ type: 'text', text: 'first request' }],
    });
    await flushAsyncWork();
    socket.receive({ type: 'lifecycle.started', lifecycleId: 'lifecycle-1' });

    const secondPrompt = server.prompt({
      sessionId,
      messageId: 'message-2',
      prompt: [{ type: 'text', text: 'second request' }],
    });
    await flushAsyncWork();

    expect(socket.sent.map((entry) => JSON.parse(entry))).toEqual([
      { type: 'chat:send', message: 'first request' },
      { type: 'chat:send', message: 'second request' },
    ]);

    socket.receive({ type: 'lifecycle.completed', lifecycleId: 'lifecycle-1' });

    await expect(firstPrompt).resolves.toEqual({
      stopReason: 'end_turn',
      userMessageId: 'message-1',
    });
    await expect(secondPrompt).resolves.toEqual({
      stopReason: 'end_turn',
      userMessageId: 'message-2',
    });
  });

  test('reports websocket connection failures during session creation', async () => {
    const { connection } = createConnectionCollector();
    const socket = new FakeBridgeSocket(false);
    queueMicrotask(() => {
      socket.close(1006, 'connect failed');
    });

    const server = new CozyBaseAcpServer(connection as never, {
      daemonUrl: 'http://127.0.0.1:8787',
      workspaceDir: '/tmp/workspace',
      socketFactory: () => socket,
    });

    await expect(server.newSession({
      cwd: '/tmp/workspace',
      mcpServers: [],
    })).rejects.toThrow('Failed to connect to CozyBase daemon');
  });

  test('builds CozyBase websocket URLs from daemon URLs', () => {
    expect(buildCozyBaseWebSocketUrl('http://127.0.0.1:8787/')).toBe('ws://127.0.0.1:8787/api/v1/cozybase/ws');
    expect(buildCozyBaseWebSocketUrl('https://demo.cozybase.dev')).toBe('wss://demo.cozybase.dev/api/v1/cozybase/ws');
  });
});
