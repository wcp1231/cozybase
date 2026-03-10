import type { ProviderSessionSnapshot, StoredMessage } from './types.js';

export function projectHistoryFromSnapshot(snapshot: ProviderSessionSnapshot): StoredMessage[] {
  const state = (snapshot.state ?? {}) as {
    history?: unknown;
    messages?: unknown;
  };

  if (Array.isArray(state.history)) {
    return state.history.filter(isStoredMessage);
  }

  if (Array.isArray(state.messages)) {
    return projectPiAgentCoreHistory(state.messages);
  }

  return [];
}

function isStoredMessage(value: unknown): value is StoredMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const role = (value as { role?: unknown }).role;
  return role === 'user' || role === 'assistant' || role === 'tool';
}

function projectPiAgentCoreHistory(messages: unknown[]): StoredMessage[] {
  const history: StoredMessage[] = [];

  for (const message of messages) {
    if (!message || typeof message !== 'object' || !('role' in message)) {
      continue;
    }

    const role = String((message as { role?: unknown }).role ?? '');
    if (role === 'user') {
      history.push({ role: 'user', content: extractUserContent((message as { content?: unknown }).content) });
      continue;
    }

    if (role === 'assistant') {
      const content = extractAssistantContent((message as { content?: unknown }).content);
      if (content) {
        history.push({ role: 'assistant', content });
      }
      continue;
    }

    if (role === 'toolResult') {
      history.push({
        role: 'tool',
        toolName: String((message as { toolName?: unknown }).toolName ?? 'tool'),
        status: 'done',
        summary: extractToolResultContent((message as { content?: unknown }).content),
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
        return (part as { type?: unknown; text?: unknown }).type === 'text'
          ? String((part as { text?: unknown }).text ?? '')
          : '';
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
      const typedPart = part as { type?: unknown; text?: unknown; thinking?: unknown };
      if (typedPart.type === 'text') {
        return String(typedPart.text ?? '');
      }
      if (typedPart.type === 'thinking') {
        return String(typedPart.thinking ?? '');
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
      return (part as { type?: unknown; text?: unknown }).type === 'text'
        ? String((part as { text?: unknown }).text ?? '')
        : '';
    })
    .filter(Boolean)
    .join('\n');

  return text || 'completed';
}
