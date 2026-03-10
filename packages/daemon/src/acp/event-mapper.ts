import type { AgentEvent } from '@cozybase/ai-runtime';
import type {
  SessionUpdate,
  ToolKind,
} from '@agentclientprotocol/sdk';

interface MessageState {
  acpMessageId: string;
  sawDelta: boolean;
}

export class CozyBaseAcpEventMapper {
  private messages = new Map<string, MessageState>();

  beginPrompt(): void {
    this.messages.clear();
  }

  map(event: AgentEvent): SessionUpdate[] {
    switch (event.type) {
      case 'conversation.run.started':
        this.beginPrompt();
        return [];
      case 'conversation.message.started':
        this.ensureMessageState(event.messageId);
        return [];
      case 'conversation.message.delta':
        return [this.toMessageChunk(event.messageId, event.role, event.delta, true)];
      case 'conversation.message.completed':
        return this.mapMessageCompleted(event.messageId, event.role, event.content);
      case 'conversation.tool.started':
        return [{
          sessionUpdate: 'tool_call',
          toolCallId: event.toolUseId,
          title: event.toolName,
          kind: mapToolKind(event.toolName),
          status: 'pending',
        }];
      case 'conversation.tool.progress':
        return [{
          sessionUpdate: 'tool_call_update',
          toolCallId: event.toolUseId,
          title: event.toolName,
          status: 'in_progress',
        }];
      case 'conversation.tool.completed':
        return [{
          sessionUpdate: 'tool_call_update',
          toolCallId: event.toolUseId,
          title: event.toolName,
          status: 'completed',
          content: [{
            type: 'content',
            content: {
              type: 'text',
              text: event.summary,
            },
          }],
          rawOutput: {
            summary: event.summary,
          },
        }];
      case 'conversation.notice':
        return [{
          sessionUpdate: 'agent_message_chunk',
          messageId: crypto.randomUUID(),
          content: {
            type: 'text',
            text: event.message,
          },
        }];
      default:
        return [];
    }
  }

  private mapMessageCompleted(
    messageId: string,
    role: 'assistant' | 'thinking',
    content: string,
  ): SessionUpdate[] {
    const state = this.ensureMessageState(messageId);
    this.messages.delete(messageId);

    if (state.sawDelta) {
      return [];
    }

    return [this.buildMessageChunk(state.acpMessageId, role, content)];
  }

  private toMessageChunk(
    messageId: string,
    role: 'assistant' | 'thinking',
    text: string,
    sawDelta: boolean,
  ): SessionUpdate {
    const state = this.ensureMessageState(messageId);
    state.sawDelta = state.sawDelta || sawDelta;
    return this.buildMessageChunk(state.acpMessageId, role, text);
  }

  private buildMessageChunk(
    acpMessageId: string,
    role: 'assistant' | 'thinking',
    text: string,
  ): SessionUpdate {
    return {
      sessionUpdate: role === 'thinking' ? 'agent_thought_chunk' : 'agent_message_chunk',
      messageId: acpMessageId,
      content: {
        type: 'text',
        text,
      },
    };
  }

  private ensureMessageState(messageId: string): MessageState {
    const existing = this.messages.get(messageId);
    if (existing) {
      return existing;
    }
    const created: MessageState = {
      acpMessageId: crypto.randomUUID(),
      sawDelta: false,
    };
    this.messages.set(messageId, created);
    return created;
  }
}

export function mapToolKind(toolName: string): ToolKind {
  const normalized = toolName.toLowerCase();
  if (normalized.includes('list_apps') || normalized.includes('get_app_detail')) {
    return 'read';
  }
  if (normalized.includes('delete_app')) {
    return 'delete';
  }
  if (
    normalized.includes('create_app') ||
    normalized.includes('develop_app') ||
    normalized.includes('operate_app') ||
    normalized.includes('start_app') ||
    normalized.includes('stop_app') ||
    normalized.includes('bash') ||
    normalized.includes('command')
  ) {
    return 'execute';
  }
  return 'other';
}
