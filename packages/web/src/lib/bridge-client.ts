// BridgeClient — Web-side bridge between WebSocket (Daemon) and direct DOM inspection.
// Receives ui:request from Daemon via WebSocket, calls the registered handler, sends ui:response back.

interface UiToolRequest {
  type: 'ui:request';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

interface UiToolResponse {
  type: 'ui:response';
  id: string;
  result?: unknown;
  error?: string;
}

export type RequestHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private handler: RequestHandler | null = null;
  private boundHandleWsMessage: (event: MessageEvent) => void;

  constructor() {
    this.boundHandleWsMessage = this.handleWsMessage.bind(this);
  }

  setWebSocket(ws: WebSocket | null): void {
    if (this.ws) {
      this.ws.removeEventListener('message', this.boundHandleWsMessage);
    }
    this.ws = ws;
    if (ws) {
      ws.addEventListener('message', this.boundHandleWsMessage);
    }
  }

  setHandler(handler: RequestHandler | null): void {
    this.handler = handler;
  }

  private handleWsMessage(event: MessageEvent): void {
    let data: UiToolRequest;
    try {
      data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
    } catch {
      return;
    }

    if (data?.type !== 'ui:request') return;

    this.handleRequest(data);
  }

  private async handleRequest(request: UiToolRequest): Promise<void> {
    const response: UiToolResponse = {
      type: 'ui:response',
      id: request.id,
    };

    try {
      if (!this.handler) {
        throw new Error('No handler registered');
      }
      response.result = await this.handler(request.method, request.params);
    } catch (err) {
      response.error = err instanceof Error ? err.message : String(err);
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }
}
