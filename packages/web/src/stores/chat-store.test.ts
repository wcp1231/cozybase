import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

type Handlers = {
  onMessage: (msg: unknown) => void;
  onStatus: (connected: boolean) => void;
};

const chatClientState = {
  instances: [] as MockChatClient[],
};

class MockChatClient {
  public sent: unknown[] = [];

  constructor(
    public readonly url: string,
    private readonly handlers: Handlers,
  ) {
    chatClientState.instances.push(this);
  }

  connect(): void {}

  disconnect(): void {}

  send(data: unknown): void {
    this.sent.push(data);
  }

  emitMessage(msg: unknown): void {
    this.handlers.onMessage(msg);
  }

  emitStatus(connected: boolean): void {
    this.handlers.onStatus(connected);
  }
}

mock.module('../lib/chat-client', () => ({
  ChatClient: MockChatClient,
  getChatWsUrl(appName: string) {
    return `ws://chat/${appName}`;
  },
}));

const { useChatStore } = await import('./chat-store');

function latestClient(): MockChatClient {
  const client = chatClientState.instances.at(-1);
  if (!client) {
    throw new Error('expected a chat client instance');
  }
  return client;
}

beforeEach(() => {
  chatClientState.instances = [];
  useChatStore.getState().setOnReconciled(null);
  useChatStore.getState().setActiveApp(null);
});

afterEach(() => {
  useChatStore.getState().setOnReconciled(null);
  useChatStore.getState().setActiveApp(null);
});

describe('useChatStore', () => {
  test('drops stale deltas after session.history resets the in-flight indexes', () => {
    useChatStore.getState().setActiveApp('orders');
    const client = latestClient();

    client.emitStatus(true);
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'hel',
    });

    expect(useChatStore.getState().messages).toEqual([
      { role: 'assistant', content: 'hel' },
    ]);

    client.emitMessage({
      type: 'session.history',
      messages: [{ role: 'assistant', content: 'persisted' }],
    });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'lo',
    });

    expect(useChatStore.getState().messages).toEqual([
      { role: 'assistant', content: 'persisted' },
    ]);
  });

  test('continues an in-flight assistant message after reconnect with buffer replay', () => {
    useChatStore.getState().setActiveApp('orders');
    const client = latestClient();

    // Initial connection: run starts, first delta arrives
    client.emitStatus(true);
    client.emitMessage({ type: 'conversation.run.started' });
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'hel',
    });

    // Reconnect: server sends session.connected + session.history + buffer replay
    client.emitMessage({ type: 'session.connected', hasSession: true, streaming: true });
    client.emitMessage({
      type: 'session.history',
      messages: [{ role: 'user', content: 'hi' }],
    });
    // Buffer replay: server re-sends all in-progress run events
    client.emitMessage({ type: 'conversation.run.started' });
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'hel',
    });

    // Post-reconnect live events continue streaming
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'lo',
    });
    client.emitMessage({
      type: 'conversation.message.completed',
      messageId: 'm-1',
      role: 'assistant',
      content: 'hello',
    });
    client.emitMessage({ type: 'conversation.run.completed', sessionId: 'sess-1' });

    expect(useChatStore.getState().messages).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);
    expect(useChatStore.getState().streaming).toBe(false);
  });

  test('already-persisted messages do not duplicate when reconnecting mid-run', () => {
    useChatStore.getState().setActiveApp('orders');
    const client = latestClient();

    // First message in the run completes before disconnect
    client.emitStatus(true);
    client.emitMessage({ type: 'conversation.run.started' });
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-1',
      role: 'assistant',
      delta: 'first',
    });
    client.emitMessage({
      type: 'conversation.message.completed',
      messageId: 'm-1',
      role: 'assistant',
      content: 'first answer',
    });

    // Second message starts (still in-progress when disconnect happens)
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-2', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-2',
      role: 'assistant',
      delta: 'sec',
    });

    // Reconnect: history contains m-1 (already persisted), buffer replay contains
    // only m-2 events (m-1 was trimmed from the buffer after it was persisted)
    client.emitMessage({ type: 'session.connected', hasSession: true, streaming: true });
    client.emitMessage({
      type: 'session.history',
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'first answer' },
      ],
    });
    // Buffer replay: only run.started + m-2 events (m-1 was trimmed)
    client.emitMessage({ type: 'conversation.run.started' });
    client.emitMessage({ type: 'conversation.message.started', messageId: 'm-2', role: 'assistant' });
    client.emitMessage({
      type: 'conversation.message.delta',
      messageId: 'm-2',
      role: 'assistant',
      delta: 'sec',
    });

    // m-2 completes
    client.emitMessage({
      type: 'conversation.message.completed',
      messageId: 'm-2',
      role: 'assistant',
      content: 'second answer',
    });

    expect(useChatStore.getState().messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'first answer' },
      { role: 'assistant', content: 'second answer' },
    ]);
  });
});
