/**
 * ChatService — Orchestrates browser WebSocket ↔ Claude Agent SDK sessions.
 *
 * Manages the SDKSession lifecycle, bridges browser messages to the SDK query,
 * and forwards SDK messages back to the browser via WebSocket.
 *
 * Design note: Uses V1 query() API with resume for multi-turn conversations.
 * V2 unstable_v2_createSession is not used because SDKSessionOptions does not
 * support mcpServers, cwd, or systemPrompt.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  Options,
  SDKMessage,
  McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';

export interface ChatServiceConfig {
  /** In-process MCP server config from createSdkMcpServer() */
  mcpServer: McpSdkServerConfigWithInstance;
  /** Agent working directory (CWD for Claude built-in tools) */
  agentDir: string;
  /** System prompt */
  systemPrompt: string;
  /** Model to use */
  model?: string;
}

/** Message from browser → daemon */
export type ChatInboundMessage =
  | { type: 'chat:send'; message: string }
  | { type: 'chat:cancel' };

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

export class ChatService {
  private config: ChatServiceConfig;
  private activeQuery: Query | null = null;
  private sessionId: string | null = null;
  private ws: WebSocketLike | null = null;
  private streaming = false;

  constructor(config: ChatServiceConfig) {
    this.config = config;
  }

  /**
   * Connect a browser WebSocket to this service.
   * Only one WebSocket is supported at a time (MVP single session).
   */
  connect(ws: WebSocketLike): void {
    this.ws = ws;

    // Send current session state to browser
    this.sendToWs({
      type: 'chat:status',
      connected: true,
      hasSession: this.sessionId !== null,
      streaming: this.streaming,
    });
  }

  /**
   * Handle an inbound message from the browser WebSocket.
   */
  async handleMessage(ws: WebSocketLike, raw: string): Promise<void> {
    let msg: ChatInboundMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      this.sendToWs({ type: 'chat:error', error: 'Invalid JSON' });
      return;
    }

    switch (msg.type) {
      case 'chat:send':
        await this.handleUserMessage(msg.message);
        break;

      case 'chat:cancel':
        this.handleCancel();
        break;

      default:
        this.sendToWs({ type: 'chat:error', error: `Unknown message type: ${(msg as any).type}` });
    }
  }

  /**
   * Disconnect a browser WebSocket. Session is preserved for reconnection.
   */
  disconnect(ws: WebSocketLike): void {
    if (this.ws === ws) {
      this.ws = null;
    }
  }

  /**
   * Shutdown the service and clean up resources.
   */
  shutdown(): void {
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
    this.ws = null;
    this.sessionId = null;
    this.streaming = false;
  }

  // --- Internal ---

  private async handleUserMessage(text: string): Promise<void> {
    if (this.streaming) {
      this.sendToWs({ type: 'chat:error', error: 'Agent is busy processing a previous message' });
      return;
    }

    if (!text.trim()) {
      return;
    }

    this.streaming = true;
    this.sendToWs({ type: 'chat:streaming', streaming: true });

    try {
      const options: Options = {
        model: this.config.model ?? 'claude-sonnet-4-6',
        cwd: this.config.agentDir,
        systemPrompt: this.config.systemPrompt,
        tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        allowedTools: [
          'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
          'mcp__cozybase__*',
        ],
        mcpServers: { cozybase: this.config.mcpServer },
        permissionMode: 'acceptEdits',
        // Load project settings so the SDK picks up CLAUDE.md and .claude/skills
        settingSources: ['project'],
      };

      // Resume previous session if available
      if (this.sessionId) {
        options.resume = this.sessionId;
      }

      this.activeQuery = query({ prompt: text, options });

      for await (const msg of this.activeQuery) {
        this.forwardSdkMessage(msg);

        // Capture session_id for subsequent resume
        if (msg.type === 'result' && !msg.is_error && 'session_id' in msg) {
          this.sessionId = msg.session_id;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendToWs({ type: 'chat:error', error: message });
    } finally {
      this.activeQuery = null;
      this.streaming = false;
      this.sendToWs({ type: 'chat:streaming', streaming: false });
    }
  }

  private handleCancel(): void {
    if (this.activeQuery) {
      this.activeQuery.interrupt();
    }
  }

  /**
   * Forward an SDKMessage to the browser, filtering/transforming as needed.
   */
  private forwardSdkMessage(msg: SDKMessage): void {
    // Forward all message types — let the frontend decide what to render.
    // Skip user message replays (they are re-sent by resume).
    if (msg.type === 'user') {
      return;
    }

    this.sendToWs(msg);
  }

  private sendToWs(data: unknown): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }
}
