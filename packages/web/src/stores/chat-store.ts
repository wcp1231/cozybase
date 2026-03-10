/**
 * useChatStore — Zustand store for AI chat state.
 *
 * WebSocket lifecycle is driven by `setActiveSession(target)`, not by module load.
 * Each APP/session kind gets its own WebSocket connection.
 */

import { create } from 'zustand';
import { ChatClient, getBuilderChatWsUrl, getOperatorChatWsUrl } from '../lib/chat-client';
import type { AgentEvent, SessionEvent } from '@cozybase/ai-runtime/types';

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

export type ChatSessionKind = 'builder' | 'operator';

export interface ChatSessionTarget {
  kind: ChatSessionKind;
  appName: string;
}

export interface ChatState {
  activeSession: ChatSessionTarget | null;
  messages: ChatMessage[];
  streaming: boolean;
  connected: boolean;
  canCancel: boolean;
  setActiveSession: (target: ChatSessionTarget | null) => void;
  send: (text: string) => void;
  cancel: () => void;
  setOnReconciled: (callback: (() => void) | null) => void;
}

// --- Index maps for correlating streaming events (plain variables, not reactive) ---

/** messageId → index in the messages array */
let messageIndex = new Map<string, number>();

/** toolUseId → index in the messages array */
let toolIndex = new Map<string, number>();

// --- WebSocket client (managed outside React) ---
let client: ChatClient | null = null;

// --- Generation counter to guard against stale callbacks ---
let generation = 0;

// --- Reconcile callback (plain variable, not reactive) ---
let onReconciledCallback: (() => void) | null = null;

type WireEvent = AgentEvent | SessionEvent | { type: string; [k: string]: unknown };

function handleMessage(
  set: (fn: (s: ChatState) => Partial<ChatState>) => void,
  gen: number,
  msg: WireEvent,
) {
  if (!msg || typeof msg !== 'object') return;
  // Stale callback from a previous client — ignore
  if (gen !== generation) return;

  switch (msg.type) {
    // --- session.* events ---

    case 'session.connected':
      set(() => ({
        connected: true,
        streaming: (msg as any).streaming ?? false,
      }));
      break;

    case 'session.history': {
      const raw = (msg as any).messages;
      if (Array.isArray(raw)) {
        // Reset index maps: reconnect invalidates any in-flight streaming positions
        resetIndexMaps();
        const restored: ChatMessage[] = raw.map((m: any) => {
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
    }

    case 'session.reconciled':
      onReconciledCallback?.();
      break;

    case 'session.error':
      set((s) => ({
        messages: [
          ...s.messages,
          { role: 'assistant', content: `Error: ${(msg as any).message ?? ''}` },
        ],
        streaming: false,
      }));
      break;

    // --- conversation.run.* ---

    case 'conversation.run.started':
      set(() => ({ streaming: true }));
      break;

    case 'conversation.run.completed':
      set(() => ({ streaming: false }));
      break;

    // --- conversation.message.* ---

    case 'conversation.message.started': {
      const { messageId } = msg as any;
      set((s) => {
        const idx = s.messages.length;
        messageIndex.set(messageId, idx);
        return {
          messages: [
            ...s.messages,
            { role: 'assistant' as const, content: '' },
          ],
        };
      });
      break;
    }

    case 'conversation.message.delta': {
      const { messageId, delta } = msg as any;
      const idx = messageIndex.get(messageId);
      if (idx === undefined) break;
      set((s) => {
        const entry = s.messages[idx];
        if (!entry || entry.role === 'tool') return s;
        const updated = [...s.messages];
        updated[idx] = { ...entry, content: (entry as ChatTextMessage).content + delta };
        return { messages: updated };
      });
      break;
    }

    case 'conversation.message.completed': {
      const { messageId, content } = msg as any;
      const idx = messageIndex.get(messageId);
      if (idx === undefined) break;
      messageIndex.delete(messageId);
      set((s) => {
        const entry = s.messages[idx];
        if (!entry || entry.role === 'tool') return s;
        const updated = [...s.messages];
        updated[idx] = { role: 'assistant', content: content ?? '' };
        return { messages: updated };
      });
      break;
    }

    // --- conversation.tool.* ---

    case 'conversation.tool.started': {
      const { toolUseId, toolName } = msg as any;
      set((s) => {
        const idx = s.messages.length;
        toolIndex.set(toolUseId, idx);
        return {
          messages: [
            ...s.messages,
            { role: 'tool' as const, toolName: toolName ?? 'tool', status: 'running' as const },
          ],
        };
      });
      break;
    }

    case 'conversation.tool.completed': {
      const { toolUseId, summary } = msg as any;
      const idx = toolIndex.get(toolUseId);
      if (idx === undefined) break;
      toolIndex.delete(toolUseId);
      set((s) => {
        const entry = s.messages[idx];
        if (!entry || entry.role !== 'tool') return s;
        const updated = [...s.messages];
        updated[idx] = { ...entry, status: 'done' as const, summary };
        return { messages: updated };
      });
      break;
    }

    case 'conversation.error':
      set((s) => ({
        messages: [
          ...s.messages,
          { role: 'assistant' as const, content: `Error: ${(msg as any).message ?? ''}` },
        ],
        streaming: false,
      }));
      break;

    // conversation.notice, conversation.tool.progress — no UI action needed
    default:
      break;
  }
}

function resetIndexMaps() {
  messageIndex = new Map();
  toolIndex = new Map();
}

export const useChatStore = create<ChatState>((set) => ({
  activeSession: null,
  messages: [],
  streaming: false,
  connected: false,
  canCancel: false,

  setActiveSession(target: ChatSessionTarget | null) {
    // Bump generation so stale callbacks from the old client are ignored
    const gen = ++generation;

    // Tear down existing connection
    if (client) {
      client.disconnect();
      client = null;
    }
    resetIndexMaps();

    if (!target) {
      set({ activeSession: null, messages: [], streaming: false, connected: false, canCancel: false });
      return;
    }

    set({
      activeSession: target,
      messages: [],
      streaming: false,
      connected: false,
      canCancel: target.kind === 'builder',
    });

    const url = target.kind === 'builder'
      ? getBuilderChatWsUrl(target.appName)
      : getOperatorChatWsUrl(target.appName);

    client = new ChatClient(url, {
      onMessage: (msg) => handleMessage(set, gen, msg as WireEvent),
      onStatus: (connected) => {
        if (gen !== generation) return;
        set({ connected });
      },
    });
    client.connect();
  },

  send(text: string) {
    if (!text.trim()) return;
    if (!useChatStore.getState().activeSession) return;
    set((s) => ({
      messages: [...s.messages, { role: 'user', content: text }],
    }));
    client?.send({ type: 'chat:send', message: text });
  },

  cancel() {
    if (useChatStore.getState().activeSession?.kind !== 'builder') return;
    client?.send({ type: 'chat:cancel' });
  },

  setOnReconciled(callback: (() => void) | null) {
    onReconciledCallback = callback;
  },
}));
