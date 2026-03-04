/**
 * ChatSession — Per-app AI Agent session.
 *
 * Each ChatSession is bound to a single app. It orchestrates the browser
 * WebSocket ↔ Claude Agent SDK communication and persists messages + session
 * state to the SessionStore.
 *
 * Refactored from the former single-instance ChatService.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  Options,
  SDKMessage,
  McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';
import type { SessionStore } from './session-store';
import { buildSystemPrompt } from './system-prompt';
import type { EventBus } from '../core/event-bus';

export interface ChatSessionConfig {
  /** In-process MCP server config from createSdkMcpServer() */
  mcpServer: McpSdkServerConfigWithInstance;
  /** Agent working directory (CWD for Claude built-in tools) */
  agentDir: string;
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

export class ChatSession {
  readonly appSlug: string;
  private config: ChatSessionConfig;
  private store: SessionStore;
  private activeQuery: Query | null = null;
  private sdkSessionId: string | null;
  private ws: WebSocketLike | null = null;
  private streaming = false;
  private unsubscribeReconcile: (() => void) | null = null;
  private toolUseMap = new Map<string, string>();

  constructor(
    appSlug: string,
    config: ChatSessionConfig,
    store: SessionStore,
    sdkSessionId: string | null = null,
    eventBus?: EventBus,
  ) {
    this.appSlug = appSlug;
    this.config = config;
    this.store = store;
    this.sdkSessionId = sdkSessionId;

    // Subscribe to reconcile events for this app
    if (eventBus) {
      this.unsubscribeReconcile = eventBus.on('app:reconciled', (data: { appSlug: string }) => {
        if (data.appSlug === this.appSlug) {
          this.sendToWs({ type: 'app:reconciled', appSlug: data.appSlug });
        }
      });
    }
  }

  /**
   * Connect a browser WebSocket to this session.
   * Sends status + chat history on connect.
   */
  connect(ws: WebSocketLike): void {
    this.ws = ws;

    // Send current session state
    this.sendToWs({
      type: 'chat:status',
      connected: true,
      hasSession: this.sdkSessionId !== null,
      streaming: this.streaming,
    });

    // Send persisted message history
    const history = this.store.getMessages(this.appSlug);
    if (history.length > 0) {
      this.sendToWs({
        type: 'chat:history',
        messages: history.map((m) => {
          if (m.role === 'tool') {
            return {
              role: 'tool',
              toolName: m.toolName,
              status: m.toolStatus ?? 'done',
              summary: m.toolSummary,
            };
          }
          return { role: m.role, content: m.content };
        }),
      });
    }
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
   * Shutdown the session and clean up resources.
   */
  shutdown(): void {
    if (this.unsubscribeReconcile) {
      this.unsubscribeReconcile();
      this.unsubscribeReconcile = null;
    }
    if (this.activeQuery) {
      this.activeQuery.close();
      this.activeQuery = null;
    }
    this.ws = null;
    this.streaming = false;
  }

  /**
   * Inject a prompt from the backend (no WebSocket required).
   * Used by the AI app creation flow to start Agent work before the browser connects.
   * Rejects if a query is already in progress.
   */
  async injectPrompt(text: string): Promise<void> {
    if (this.streaming) {
      throw new Error('Agent is busy processing a previous message');
    }
    // Delegate to the same handler used by WebSocket messages
    await this.handleUserMessage(text);
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

    // Persist user message
    this.store.addMessage(this.appSlug, { role: 'user', content: text });

    this.streaming = true;
    this.toolUseMap.clear();
    this.sendToWs({ type: 'chat:streaming', streaming: true });

    try {
      const options: Options = {
        model: this.config.model ?? 'claude-sonnet-4-6',
        cwd: this.config.agentDir,
        systemPrompt: buildSystemPrompt(this.appSlug),
        tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
        allowedTools: [
          'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
          'mcp__cozybase__*',
        ],
        mcpServers: { cozybase: this.config.mcpServer },
        permissionMode: 'acceptEdits',
        settingSources: ['project'],
      };

      // Resume previous session if available
      if (this.sdkSessionId) {
        options.resume = this.sdkSessionId;
      }

      this.activeQuery = query({ prompt: text, options });

      for await (const msg of this.activeQuery) {
        this.forwardSdkMessage(msg);

        // Persist assistant messages and track tool_use blocks
        if (msg.type === 'assistant' && msg.message?.content) {
          const content = msg.message.content;

          // Track tool_use_id → tool_name for later tool_use_summary lookup
          if (Array.isArray(content)) {
            for (const block of content as any[]) {
              if (block.type === 'tool_use' && block.id && block.name) {
                this.toolUseMap.set(block.id, block.name);
              }
            }
          }

          const text = this.extractTextContent(content);
          if (text) {
            this.store.addMessage(this.appSlug, { role: 'assistant', content: text });
          }
        }

        // Persist tool summaries with resolved tool name
        if (msg.type === 'tool_use_summary') {
          const ids: string[] = (msg as any).preceding_tool_use_ids ?? [];
          const toolNames = ids.map((id: string) => this.toolUseMap.get(id)).filter(Boolean);
          const toolName = toolNames.length > 0 ? toolNames.join(', ') : 'tool';
          this.store.addMessage(this.appSlug, {
            role: 'tool',
            content: '',
            toolName,
            toolStatus: 'done',
            toolSummary: (msg as any).summary ?? '',
          });
        }

        // Capture session_id for subsequent resume
        if (msg.type === 'result' && !msg.is_error && 'session_id' in msg) {
          this.sdkSessionId = msg.session_id;
          this.store.saveSessionId(this.appSlug, msg.session_id);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendToWs({ type: 'chat:error', error: message });

      // If resume failed, clear stale SDK session ID but keep message history
      if (this.sdkSessionId && message.includes('session')) {
        this.sdkSessionId = null;
        this.store.clearSessionId(this.appSlug);
      }
    } finally {
      this.activeQuery = null;
      this.streaming = false;
      this.toolUseMap.clear();
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
    // Skip user message replays (they are re-sent by resume)
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

  /** Extract plain text from Anthropic message content blocks. */
  private extractTextContent(content: unknown): string {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('');
  }
}
