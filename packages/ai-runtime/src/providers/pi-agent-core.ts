import { Agent, ProviderTransport, type AppMessage } from '@mariozechner/pi-agent-core';
import type {
  AgentEvent,
  AgentRuntimeProvider,
  AgentRuntimeSession,
  AgentSessionSpec,
  ProviderSessionSnapshot,
  StoredMessage,
} from '../types.js';

interface PiAgentCoreSessionOptions {
  getApiKey?: () => string | undefined;
}

export class PiAgentCoreProvider implements AgentRuntimeProvider {
  readonly kind = 'pi-agent-core';
  readonly capabilities = {
    toolModes: ['native', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: false,
    supportsContextTransform: true,
    supportsHistoryProjection: true,
  } as const;

  async createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    return new PiAgentCoreRuntimeSession(spec);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

class PiAgentCoreRuntimeSession implements AgentRuntimeSession {
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly agent: Agent;
  private readonly providerKind = 'pi-agent-core';
  private messageCounter = 0;
  private toolCounter = 0;
  private activeAssistantMessageId: string | null = null;
  private activeToolUseId: string | null = null;
  private activeToolName = 'tool';
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly spec: AgentSessionSpec) {
    const providerOptions = (spec.providerOptions ?? {}) as PiAgentCoreSessionOptions;
    const maxMessages = spec.contextPolicy?.maxMessages;
    this.agent = new Agent({
      transport: new ProviderTransport({
        getApiKey: providerOptions.getApiKey,
      }),
      initialState: spec.systemPrompt
        ? {
            systemPrompt: spec.systemPrompt,
          }
        : undefined,
      messageTransformer: maxMessages
        ? ((messages: AppMessage[]) => messages.slice(-maxMessages) as never)
        : undefined,
    });
    if (spec.systemPrompt) {
      this.agent.setSystemPrompt(spec.systemPrompt);
    }
    if (spec.model) {
      this.agent.setModel(spec.model as never);
    }
    this.agent.setTools((spec.nativeTools ?? []) as never);

    this.unsubscribe = this.agent.subscribe((event: unknown) => {
      const mapped = this.mapAgentEvent(event);
      if (mapped) {
        this.emit(mapped);
      }
    });
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(text: string): Promise<void> {
    await this.agent.prompt(text);
  }

  async interrupt(): Promise<void> {
    return;
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  async exportSnapshot(): Promise<ProviderSessionSnapshot | null> {
    return {
      providerKind: this.providerKind,
      version: 1,
      state: {
        messages: this.agent.state.messages,
      },
    };
  }

  async restoreSnapshot(snapshot: ProviderSessionSnapshot): Promise<void> {
    if (snapshot.providerKind !== this.providerKind) {
      throw new Error(`Snapshot provider mismatch: expected '${this.providerKind}', got '${snapshot.providerKind}'`);
    }

    const state = (snapshot.state ?? {}) as { messages?: unknown };
    if (Array.isArray(state.messages)) {
      this.agent.replaceMessages(state.messages as never);
    }
  }

  async getHistory(): Promise<StoredMessage[]> {
    return toStoredHistory(this.agent.state.messages);
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private mapAgentEvent(event: unknown): AgentEvent | null {
    const raw = event as Record<string, any>;
    switch (raw.type) {
      case 'agent_start':
        return { type: 'conversation.run.started' };
      case 'agent_end':
        return { type: 'conversation.run.completed', sessionId: '' };
      case 'message_start':
        if (raw.message?.role !== 'assistant') {
          return null;
        }
        this.activeAssistantMessageId = `msg-${++this.messageCounter}`;
        return {
          type: 'conversation.message.started',
          messageId: this.activeAssistantMessageId,
          role: 'assistant',
        };
      case 'message_update': {
        const delta = extractAssistantDelta(raw.assistantMessageEvent);
        if (!this.activeAssistantMessageId || !delta) {
          return null;
        }
        return {
          type: 'conversation.message.delta',
          messageId: this.activeAssistantMessageId,
          role: 'assistant',
          delta,
        };
      }
      case 'message_end': {
        if (!this.activeAssistantMessageId || raw.message?.role !== 'assistant') {
          return null;
        }
        const messageId = this.activeAssistantMessageId;
        this.activeAssistantMessageId = null;
        return {
          type: 'conversation.message.completed',
          messageId,
          role: 'assistant',
          content: extractMessageText(raw.message),
        };
      }
      case 'tool_execution_start':
        this.activeToolUseId = extractToolUseId(raw) ?? `tool-${++this.toolCounter}`;
        this.activeToolName = extractToolName(raw);
        return {
          type: 'conversation.tool.started',
          toolUseId: this.activeToolUseId,
          toolName: this.activeToolName,
        };
      case 'tool_execution_end': {
        const toolUseId = this.activeToolUseId ?? extractToolUseId(raw) ?? `tool-${++this.toolCounter}`;
        const toolName = this.activeToolName || extractToolName(raw);
        this.activeToolUseId = null;
        this.activeToolName = 'tool';
        return {
          type: 'conversation.tool.completed',
          toolUseId,
          toolName,
          summary: extractToolSummary(raw),
        };
      }
      default:
        return null;
    }
  }
}

function extractAssistantDelta(event: Record<string, unknown> | undefined): string {
  if (!event) {
    return '';
  }

  const type = String(event.type ?? '');
  if (type && type !== 'text_delta') {
    return '';
  }

  return String(event.delta ?? event.text ?? event.textDelta ?? '');
}

function extractMessageText(message: Record<string, any> | undefined): string {
  if (!message) {
    return '';
  }

  if (typeof message.content === 'string') {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object') {
          return String(part.text ?? part.content ?? part.result ?? '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return String(message.text ?? '');
}

function extractToolUseId(event: Record<string, any>): string | null {
  return String(
    event.toolExecution?.id
      ?? event.toolExecution?.toolUseId
      ?? event.toolUseId
      ?? '',
  ) || null;
}

function extractToolName(event: Record<string, any>): string {
  return String(
    event.toolExecution?.tool?.name
      ?? event.toolExecution?.toolName
      ?? event.toolName
      ?? event.name
      ?? 'tool',
  );
}

function extractToolSummary(event: Record<string, any>): string {
  if (typeof event.summary === 'string' && event.summary.trim()) {
    return event.summary;
  }

  const output = event.toolExecution?.result ?? event.result ?? event.output;
  if (typeof output === 'string' && output.trim()) {
    return output;
  }
  if (output && typeof output === 'object') {
    return JSON.stringify(output);
  }
  return 'completed';
}

function toStoredHistory(messages: AppMessage[]): StoredMessage[] {
  const history: StoredMessage[] = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object' || !('role' in message)) {
      continue;
    }
    if (message.role === 'user') {
      history.push({ role: 'user', content: extractUserContent(message.content) });
      continue;
    }
    if (message.role === 'assistant') {
      const content = extractAssistantContent(message.content);
      if (content) {
        history.push({ role: 'assistant', content });
      }
      continue;
    }
    if (message.role === 'toolResult') {
      history.push({
        role: 'tool',
        toolName: message.toolName,
        status: 'done',
        summary: extractToolResultContent(message.content),
      });
    }
  }

  return history;
}

function extractUserContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== 'object' || !('type' in part)) {
          return '';
        }
        return part.type === 'text' && 'text' in part ? String(part.text ?? '') : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractAssistantContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((part) => {
      if (!part || typeof part !== 'object' || !('type' in part)) {
        return '';
      }
      if (part.type === 'text' && 'text' in part) {
        return String(part.text ?? '');
      }
      if (part.type === 'thinking' && 'thinking' in part) {
        return String(part.thinking ?? '');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractToolResultContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return 'completed';
  }

  const text = content
    .map((part) => {
      if (!part || typeof part !== 'object' || !('type' in part)) {
        return '';
      }
      return part.type === 'text' && 'text' in part ? String(part.text ?? '') : '';
    })
    .filter(Boolean)
    .join('\n');

  return text || 'completed';
}
