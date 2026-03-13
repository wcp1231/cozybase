import { afterEach, describe, expect, test } from 'bun:test';
import { ChatClient } from './chat-client';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event?: any) => void>>();

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: any) => void) {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  emit(type: string, event?: any) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }
}

describe('ChatClient', () => {
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    globalThis.WebSocket = originalWebSocket;
    FakeWebSocket.instances = [];
  });

  test('queues messages until the websocket is open', () => {
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
    const statuses: boolean[] = [];
    const client = new ChatClient('ws://chat', {
      onMessage: () => {},
      onStatus: (connected) => statuses.push(connected),
    });

    client.connect();
    client.send({ type: 'chat:send', message: 'hello' });

    const ws = FakeWebSocket.instances[0];
    expect(ws?.sent).toEqual([]);

    ws?.open();

    expect(statuses).toEqual([true]);
    expect(ws?.sent).toEqual([JSON.stringify({ type: 'chat:send', message: 'hello' })]);
  });
});
