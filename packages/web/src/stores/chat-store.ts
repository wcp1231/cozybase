/**
 * useChatStore — Zustand store for AI chat state.
 *
 * WebSocket lifecycle is driven by `setActiveApp(appName)`, not by module load.
 * Each APP gets its own WebSocket connection to `/api/v1/chat/ws?app=<appName>`.
 */

import { create } from 'zustand';
import { ChatClient, getChatWsUrl } from '../lib/chat-client';

// --- Message types for the UI ---

export interface ChatTextMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatToolMessage {
  role: 'tool';
  toolName: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

export type ChatMessage = ChatTextMessage | ChatToolMessage;

export interface ChatState {
  activeApp: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  connected: boolean;
  setActiveApp: (appName: string | null) => void;
  send: (text: string) => void;
  cancel: () => void;
}

// --- Stream buffer (plain variable, not reactive) ---
let streamBuffer = '';

// --- WebSocket client (managed outside React) ---
let client: ChatClient | null = null;

// --- Generation counter to guard against stale callbacks ---
let generation = 0;

function handleMessage(set: (fn: (s: ChatState) => Partial<ChatState>) => void, gen: number, msg: any) {
  if (!msg || typeof msg !== 'object') return;
  // Stale callback from a previous client — ignore
  if (gen !== generation) return;

  switch (msg.type) {
    case 'chat:status':
      set(() => ({
        connected: msg.connected ?? false,
        streaming: msg.streaming ?? false,
      }));
      break;

    case 'chat:history':
      // Server pushes full history on connect — replace local messages
      if (Array.isArray(msg.messages)) {
        const restored: ChatMessage[] = msg.messages.map((m: any) => {
          if (m.role === 'tool') {
            return {
              role: 'tool' as const,
              toolName: m.toolName ?? 'tool',
              status: m.status ?? 'done',
              summary: m.summary,
            };
          }
          return { role: m.role, content: m.content ?? '' };
        });
        set(() => ({ messages: restored }));
      }
      break;

    case 'chat:streaming':
      set(() => ({ streaming: msg.streaming ?? false }));
      if (!msg.streaming) {
        streamBuffer = '';
      }
      break;

    case 'chat:error':
      set((s) => ({
        messages: [...s.messages, { role: 'assistant', content: `Error: ${msg.error}` }],
      }));
      break;

    // SDK message: streaming text delta
    case 'stream_event': {
      const event = msg.event;
      if (event?.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        streamBuffer += event.delta.text;
        const text = streamBuffer;
        set((s) => {
          const last = s.messages[s.messages.length - 1];
          if (last?.role === 'assistant' && !('toolName' in last)) {
            return {
              messages: [
                ...s.messages.slice(0, -1),
                { role: 'assistant', content: text },
              ],
            };
          }
          return {
            messages: [...s.messages, { role: 'assistant', content: text }],
          };
        });
      }
      break;
    }

    // SDK message: complete assistant message (replaces streaming)
    case 'assistant': {
      streamBuffer = '';
      const content = extractTextContent(msg.message?.content);
      if (content) {
        set((s) => {
          const last = s.messages[s.messages.length - 1];
          if (last?.role === 'assistant' && !('toolName' in last)) {
            return { messages: [...s.messages.slice(0, -1), { role: 'assistant', content }] };
          }
          return { messages: [...s.messages, { role: 'assistant', content }] };
        });
      }
      break;
    }

    // SDK message: tool execution progress
    case 'tool_progress': {
      const toolName = msg.tool_name ?? msg.name ?? 'tool';
      set((s) => {
        const last = s.messages[s.messages.length - 1];
        if (last?.role === 'tool' && last.toolName === toolName && last.status === 'running') {
          return s; // Already showing this tool
        }
        return { messages: [...s.messages, { role: 'tool', toolName, status: 'running' }] };
      });
      break;
    }

    // SDK message: tool execution summary
    case 'tool_use_summary': {
      const toolName = msg.tool_name ?? msg.name ?? 'tool';
      const summary = msg.summary ?? '';
      set((s) => {
        const idx = s.messages.findLastIndex(
          (m) => m.role === 'tool' && m.toolName === toolName && m.status === 'running',
        );
        if (idx >= 0) {
          const updated = [...s.messages];
          updated[idx] = { role: 'tool', toolName, status: 'done', summary };
          return { messages: updated };
        }
        return { messages: [...s.messages, { role: 'tool', toolName, status: 'done', summary }] };
      });
      break;
    }

    // SDK message: result (turn complete)
    case 'result':
      streamBuffer = '';
      break;

    // Task messages (subagent activity)
    case 'system':
      break;

    default:
      break;
  }
}

export const useChatStore = create<ChatState>((set) => ({
  activeApp: null,
  messages: [],
  streaming: false,
  connected: false,

  setActiveApp(appName: string | null) {
    // Bump generation so stale callbacks from the old client are ignored
    const gen = ++generation;

    // Tear down existing connection
    if (client) {
      client.disconnect();
      client = null;
    }
    streamBuffer = '';

    if (!appName) {
      set({ activeApp: null, messages: [], streaming: false, connected: false });
      return;
    }

    set({ activeApp: appName, messages: [], streaming: false, connected: false });

    // Create new connection scoped to the app
    client = new ChatClient(getChatWsUrl(appName), {
      onMessage: (msg) => handleMessage(set, gen, msg),
      onStatus: (connected) => {
        if (gen !== generation) return;
        set({ connected });
      },
    });
    client.connect();
  },

  send(text: string) {
    if (!text.trim()) return;
    set((s) => ({
      messages: [...s.messages, { role: 'user', content: text }],
    }));
    streamBuffer = '';
    client?.send({ type: 'chat:send', message: text });
  },

  cancel() {
    client?.send({ type: 'chat:cancel' });
  },
}));

/** Extract plain text from Anthropic message content blocks. */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .filter((block: any) => block.type === 'text')
    .map((block: any) => block.text)
    .join('');
}
