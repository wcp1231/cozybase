/**
 * UiBridge — WebSocket session manager for Agent → Browser UI communication.
 *
 * Tracks connected browser sessions (Admin UI via WebSocket) and relays
 * UI tool requests (e.g. inspect) to the browser, waiting for responses.
 *
 * Flow: Agent tool call → UiBridge.inspectUi() → WebSocket → Browser BridgeClient
 *       → postMessage → iframe bridge.js → result flows back the same path.
 */

import type { ServerWebSocket } from 'bun';

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const UI_REQUEST_TIMEOUT = 15_000; // 15s — leaves 5s margin over iframe's 10s timeout

export class UiBridge {
  private sessions = new Set<ServerWebSocket<unknown>>();
  private pendingRequests = new Map<string, PendingRequest>();

  addSession(ws: ServerWebSocket<unknown>): void {
    this.sessions.add(ws);
    console.log(`[ui-bridge] Browser session connected (total: ${this.sessions.size})`);
  }

  removeSession(ws: ServerWebSocket<unknown>): void {
    this.sessions.delete(ws);
    console.log(`[ui-bridge] Browser session disconnected (total: ${this.sessions.size})`);
  }

  handleMessage(_ws: ServerWebSocket<unknown>, message: string | Buffer): void {
    let data: { type?: string; id?: string; result?: unknown; error?: string };
    try {
      data = JSON.parse(typeof message === 'string' ? message : message.toString());
    } catch {
      return;
    }

    if (data?.type === 'ui:response' && data.id) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
      }
    }
  }

  /**
   * Send an inspect request to the browser and wait for the result.
   * Throws if no browser is connected or the request times out.
   */
  async inspectUi(appName: string, page?: string): Promise<unknown> {
    const ws = this.getActiveSession();
    if (!ws) {
      throw new Error(
        'No browser session connected. Please open Admin UI to use UI inspection tools.',
      );
    }

    const id = crypto.randomUUID();
    const request = {
      type: 'ui:request',
      id,
      method: 'inspect',
      params: { app: appName, page },
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('UI inspection timed out. The browser may be unresponsive.'));
      }, UI_REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify(request));
    });
  }

  /** Returns the first active session, or null if none connected. */
  private getActiveSession(): ServerWebSocket<unknown> | null {
    for (const ws of this.sessions) {
      return ws;
    }
    return null;
  }

  /** Clean up all pending requests and close all sessions. */
  shutdown(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Server shutting down'));
      this.pendingRequests.delete(id);
    }
    for (const ws of this.sessions) {
      ws.close();
    }
    this.sessions.clear();
  }
}
