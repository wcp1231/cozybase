/**
 * Chat WebSocket client for connecting to the daemon's chat endpoints.
 */

type MessageHandler = (msg: unknown) => void;
type StatusHandler = (connected: boolean) => void;

export class ChatClient {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler | null = null;
  private onStatus: StatusHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private pendingMessages: string[] = [];

  constructor(
    private url: string,
    handlers: { onMessage: MessageHandler; onStatus: StatusHandler },
  ) {
    this.onMessage = handlers.onMessage;
    this.onStatus = handlers.onStatus;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.doConnect();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.pendingMessages = [];
  }

  send(data: unknown): void {
    const serialized = JSON.stringify(data);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
      return;
    }
    if (this.shouldReconnect) {
      this.pendingMessages.push(serialized);
    }
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private doConnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const ws = new WebSocket(this.url);

    ws.addEventListener('open', () => {
      this.onStatus?.(true);
      this.flushPendingMessages(ws);
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        this.onMessage?.(msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.addEventListener('close', () => {
      this.onStatus?.(false);
      this.ws = null;
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.doConnect(), 2000);
      }
    });

    ws.addEventListener('error', () => {
      // Will trigger close event
    });

    this.ws = ws;
  }

  private flushPendingMessages(ws: WebSocket): void {
    if (this.pendingMessages.length === 0 || ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const queued = [...this.pendingMessages];
    this.pendingMessages = [];
    for (const payload of queued) {
      ws.send(payload);
    }
  }
}

function getWebSocketBaseUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}

export function getBuilderChatWsUrl(appName: string): string {
  return `${getWebSocketBaseUrl()}/api/v1/chat/ws?app=${encodeURIComponent(appName)}`;
}

export function getOperatorChatWsUrl(appName: string): string {
  return `${getWebSocketBaseUrl()}/api/v1/operator/ws?app=${encodeURIComponent(appName)}`;
}

export function getCozybaseChatWsUrl(): string {
  return `${getWebSocketBaseUrl()}/api/v1/cozybase/ws`;
}
