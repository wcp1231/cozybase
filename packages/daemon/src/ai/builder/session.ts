/**
 * ChatSession — Per-app Builder Agent session.
 *
 * Builder and Operator now share the same runtime-backed session skeleton.
 * Builder only customizes prompt/spec construction and its legacy message persistence.
 */

import type { AgentEvent, AgentRuntimeProvider, AgentSessionSpec, StoredMessage } from '@cozybase/ai-runtime';
import { buildSystemPrompt } from '@cozybase/builder-agent';
import type { EventBus } from '../../core/event-bus';
import { RuntimeAgentSession } from '../runtime-agent-session';
import type { RuntimeSessionStore } from '../runtime-session-store';
import type { SessionStore } from './session-store';

type ProviderOptionsFactory = (ctx: {
  appSlug: string;
  agentDir: string;
  mode: 'chat' | 'extract';
}) => unknown;

export interface ChatSessionRuntimeConfig {
  agentProvider: AgentRuntimeProvider;
  providerKind: string;
  model?: string;
  providerOptionsFactory?: ProviderOptionsFactory;
}

export interface ChatSessionConfig extends ChatSessionRuntimeConfig {
  agentDir: string;
  runtimeResolver?: () => ChatSessionRuntimeConfig;
}

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

export class ChatSession extends RuntimeAgentSession<ChatSessionRuntimeConfig> {
  private unsubscribeReconcile: (() => void) | null = null;
  private toolStartedAt = new Map<string, string>();
  private lastPersistMs = 0;
  private sameMsSequence = 0;

  constructor(
    appSlug: string,
    private readonly config: ChatSessionConfig,
    private readonly store: SessionStore,
    runtimeStore: RuntimeSessionStore,
    eventBus?: EventBus,
  ) {
    super(
      appSlug,
      runtimeStore,
      () => config.runtimeResolver?.() ?? config,
    );

    if (eventBus) {
      this.unsubscribeReconcile = eventBus.on('app:reconciled', (data: { appSlug: string }) => {
        if (data.appSlug === this.appSlug) {
          this.sendToWs({ type: 'session.reconciled', appSlug: data.appSlug });
        }
      });
    }
  }

  connect(ws: WebSocketLike): void {
    super.connect(ws);
  }

  protected getUsageType() {
    return 'builder' as const;
  }

  protected loadPersistedHistory(): StoredMessage[] {
    const runtimeHistory = this.runtimeStore.getProjectedHistory('builder', this.appSlug);
    if (runtimeHistory.length > 0) {
      return runtimeHistory;
    }

    return this.store.getMessages(this.appSlug).map((message) => {
      if (message.role === 'tool') {
        return {
          role: 'tool',
          toolName: message.toolName,
          status: (message.toolStatus as StoredMessage['status']) ?? 'done',
          summary: message.toolSummary,
        };
      }

      return {
        role: message.role,
        content: message.content,
      };
    });
  }

  protected async buildSessionSpec(runtime: ChatSessionRuntimeConfig): Promise<AgentSessionSpec> {
    const providerOptions = runtime.providerOptionsFactory?.({
      appSlug: this.appSlug,
      agentDir: this.config.agentDir,
      mode: 'chat',
    });

    return {
      systemPrompt: buildSystemPrompt(this.appSlug),
      model: runtime.model,
      cwd: this.config.agentDir,
      toolMode: 'mcp',
      mcpConfig: providerOptions,
      providerOptions,
    };
  }

  protected beforePrompt(text: string): void {
    this.store.addMessage(this.appSlug, {
      role: 'user',
      content: text,
      createdAt: this.nextCreatedAt(),
    });
    this.toolStartedAt = new Map();
  }

  protected afterPrompt(): void {
    this.runEventBuffer = [];
    this.toolStartedAt = new Map();
  }

  protected onPromptError(message: string): void {
    this.store.addMessage(this.appSlug, {
      role: 'assistant',
      content: `Error: ${message}`,
      createdAt: this.nextCreatedAt(),
    });
  }

  protected onRuntimeEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'conversation.tool.started':
        this.toolStartedAt.set(event.toolUseId, this.nextCreatedAt());
        break;
      case 'conversation.message.completed':
        if (event.role === 'assistant' && event.content) {
          this.store.addMessage(this.appSlug, {
            role: 'assistant',
            content: event.content,
            createdAt: this.nextCreatedAt(),
          });
        }
        this.trimMessageFromBuffer(event.messageId);
        break;
      case 'conversation.tool.completed': {
        const toolStartedAt = this.toolStartedAt.get(event.toolUseId) ?? this.nextCreatedAt();
        this.store.addMessage(this.appSlug, {
          role: 'tool',
          content: '',
          toolName: event.toolName,
          toolStatus: 'done',
          toolSummary: event.summary,
          createdAt: toolStartedAt,
        });
        this.toolStartedAt.delete(event.toolUseId);
        this.trimToolFromBuffer(event.toolUseId);
        break;
      }
      case 'conversation.error':
        this.store.addMessage(this.appSlug, {
          role: 'assistant',
          content: `Error: ${event.message}`,
          createdAt: this.nextCreatedAt(),
        });
        break;
      default:
        break;
    }
  }

  protected onShutdown(): void {
    this.unsubscribeReconcile?.();
    this.unsubscribeReconcile = null;
    this.toolStartedAt = new Map();
  }

  private trimMessageFromBuffer(messageId: string): void {
    this.runEventBuffer = this.runEventBuffer.filter(
      (event) => !('messageId' in event && (event as { messageId?: string }).messageId === messageId),
    );
  }

  private trimToolFromBuffer(toolUseId: string): void {
    this.runEventBuffer = this.runEventBuffer.filter(
      (event) => !('toolUseId' in event && (event as { toolUseId?: string }).toolUseId === toolUseId),
    );
  }

  private nextCreatedAt(date = new Date()): string {
    const currentMs = date.getTime();
    if (currentMs === this.lastPersistMs) {
      this.sameMsSequence += 1;
    } else {
      this.lastPersistMs = currentMs;
      this.sameMsSequence = 0;
    }

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    const millis = String(date.getUTCMilliseconds()).padStart(3, '0');
    const seq = String(this.sameMsSequence).padStart(3, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}${seq}`;
  }
}
