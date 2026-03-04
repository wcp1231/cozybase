/**
 * ChatSession — Per-app AI Agent session.
 *
 * Each ChatSession is bound to a single app. It orchestrates the browser
 * WebSocket ↔ AgentProvider communication and persists messages + session
 * state to the SessionStore.
 */

import type { AgentProvider, AgentQuery, AgentEvent } from '@cozybase/agent';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { SessionStore } from './session-store';
import { buildSystemPrompt } from './system-prompt';
import type { EventBus } from '../core/event-bus';

export interface ChatSessionConfig {
  /** AgentProvider instance injected from daemon initialization */
  agentProvider: AgentProvider;
  /** Agent working directory (CWD for Claude built-in tools) */
  agentDir: string;
  /** Model to use */
  model?: string;
  /** MCP servers to register with the agent (passed through to providerOptions) */
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
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
  private activeQuery: AgentQuery | null = null;
  private sdkSessionId: string | null;
  private ws: WebSocketLike | null = null;
  private streaming = false;
  private unsubscribeReconcile: (() => void) | null = null;
  /** Buffers AgentEvents emitted during the active run so a reconnecting client can catch up. */
  private runEventBuffer: AgentEvent[] = [];

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
          this.sendToWs({ type: 'session.reconciled', appSlug: data.appSlug });
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
      type: 'session.connected',
      hasSession: this.sdkSessionId !== null,
      streaming: this.streaming,
    });

    // Send persisted message history
    const history = this.store.getMessages(this.appSlug);
    if (history.length > 0) {
      this.sendToWs({
        type: 'session.history',
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

    // If an agent run is in progress, replay its events so the client can
    // rebuild messageIndex/toolIndex and continue receiving deltas correctly.
    if (this.streaming && this.runEventBuffer.length > 0) {
      for (const event of this.runEventBuffer) {
        this.sendToWs(event);
      }
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
      this.sendToWs({ type: 'session.error', message: 'Invalid JSON' });
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
        this.sendToWs({ type: 'session.error', message: `Unknown message type: ${(msg as any).type}` });
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
    this.runEventBuffer = [];
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
    await this.handleUserMessage(text);
  }

  // --- Internal ---

  private async handleUserMessage(text: string): Promise<void> {
    if (this.streaming) {
      this.sendToWs({ type: 'session.error', message: 'Agent is busy processing a previous message' });
      return;
    }

    if (!text.trim()) {
      return;
    }

    // Persist user message
    this.store.addMessage(this.appSlug, { role: 'user', content: text });

    this.streaming = true;

    try {
      const agentQuery = this.config.agentProvider.createQuery({
        prompt: text,
        systemPrompt: buildSystemPrompt(this.appSlug),
        cwd: this.config.agentDir,
        model: this.config.model,
        resumeSessionId: this.sdkSessionId,
        providerOptions: {
          tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
          allowedTools: [
            'Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep',
            'mcp__cozybase__*',
          ],
          mcpServers: this.config.mcpServers,
        },
      });

      this.activeQuery = agentQuery;

      for await (const event of agentQuery) {
        // Buffer for reconnect replay, then forward to the browser
        this.runEventBuffer.push(event);
        this.sendToWs(event);

        // Handle persistence and state based on event type
        switch (event.type) {
          case 'conversation.message.completed':
            if (event.role === 'assistant' && event.content) {
              this.store.addMessage(this.appSlug, {
                role: 'assistant',
                content: event.content,
              });
            }
            // Remove this message's events from buffer: they're now in session.history
            // so a reconnecting client would otherwise receive them twice.
            this.trimMessageFromBuffer(event.messageId);
            break;

          case 'conversation.tool.completed':
            this.store.addMessage(this.appSlug, {
              role: 'tool',
              content: '',
              toolName: event.toolName,
              toolStatus: 'done',
              toolSummary: event.summary,
            });
            // Same dedup: trim tool events now that they're in session.history
            this.trimToolFromBuffer(event.toolUseId);
            break;

          case 'conversation.run.completed':
            // sessionId is empty when the run was interrupted — don't overwrite
            if (event.sessionId) {
              this.sdkSessionId = event.sessionId;
              this.store.saveSessionId(this.appSlug, event.sessionId);
            }
            break;

          case 'conversation.error':
            this.store.addMessage(this.appSlug, {
              role: 'assistant',
              content: `Error: ${event.message}`,
            });
            // If resume failed, clear stale SDK session ID but keep message history
            if (this.sdkSessionId && event.message.includes('session')) {
              this.sdkSessionId = null;
              this.store.clearSessionId(this.appSlug);
            }
            break;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.sendToWs({ type: 'session.error', message });
      this.store.addMessage(this.appSlug, {
        role: 'assistant',
        content: `Error: ${message}`,
      });
      // If resume failed, clear stale SDK session ID
      if (this.sdkSessionId && message.includes('session')) {
        this.sdkSessionId = null;
        this.store.clearSessionId(this.appSlug);
      }
    } finally {
      this.activeQuery = null;
      this.streaming = false;
      this.runEventBuffer = [];
    }
  }

  private handleCancel(): void {
    if (this.activeQuery) {
      this.activeQuery.interrupt().catch((err) => {
        console.error(`[ChatSession:${this.appSlug}] interrupt() failed:`, err);
      });
    }
  }

  private sendToWs(data: unknown): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Remove all buffered events that belong to the given messageId.
   * Called after a conversation.message.completed is persisted to the store so
   * a reconnecting client won't see them again via both session.history and the buffer.
   */
  private trimMessageFromBuffer(messageId: string): void {
    this.runEventBuffer = this.runEventBuffer.filter(
      (e) => !('messageId' in e && (e as any).messageId === messageId),
    );
  }

  /**
   * Remove all buffered events that belong to the given toolUseId.
   * Called after a conversation.tool.completed is persisted.
   */
  private trimToolFromBuffer(toolUseId: string): void {
    this.runEventBuffer = this.runEventBuffer.filter(
      (e) => !('toolUseId' in e && (e as any).toolUseId === toolUseId),
    );
  }
}
