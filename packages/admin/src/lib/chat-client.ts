/**
 * Chat WebSocket client for connecting to the daemon's /api/v1/chat/ws endpoint.
 */

type MessageHandler = (msg: unknown) => void;
type StatusHandler = (connected: boolean) => void;

export class ChatClient {
  private ws: WebSocket | null = null;
  private onMessage: MessageHandler | null = null;
  private onStatus: StatusHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;

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
  }

  send(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
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
}

/** Build the WebSocket URL for the chat endpoint based on current page location. */
export function getChatWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/v1/chat/ws`;
}
