/**
 * Normalized event types for the Cozybase Agent abstraction layer.
 *
 * AgentEvent — emitted during an active agent query (conversation.* events).
 * LifecycleEvent — emitted by the session-scoped orchestrator (lifecycle.* events).
 * SessionEvent — emitted at the application/WebSocket layer (session.* events).
 */

// ---------------------------------------------------------------------------
// AgentEvent — conversation lifecycle events
// ---------------------------------------------------------------------------

/** Agent emitted a non-interactive notice (e.g. init info). */
export interface ConversationNoticeEvent {
  type: 'conversation.notice';
  message: string;
}

/** A new assistant message streaming session has begun. */
export interface ConversationMessageStartedEvent {
  type: 'conversation.message.started';
  messageId: string;
  role: 'assistant' | 'thinking';
}

/** Incremental text chunk within a streaming assistant message. */
export interface ConversationMessageDeltaEvent {
  type: 'conversation.message.delta';
  messageId: string;
  role: 'assistant' | 'thinking';
  delta: string;
}

/** The full text of a completed assistant message. */
export interface ConversationMessageCompletedEvent {
  type: 'conversation.message.completed';
  messageId: string;
  role: 'assistant' | 'thinking';
  content: string;
}

/** Agent has started executing a tool. */
export interface ConversationToolStartedEvent {
  type: 'conversation.tool.started';
  toolUseId: string;
  toolName: string;
  /** The input parameters passed to the tool. */
  input?: Record<string, unknown>;
}

/** Intermediate progress update from a running tool. */
export interface ConversationToolProgressEvent {
  type: 'conversation.tool.progress';
  toolUseId: string;
  toolName: string;
}

/** Tool execution completed with a summary. */
export interface ConversationToolCompletedEvent {
  type: 'conversation.tool.completed';
  toolUseId: string;
  toolName: string;
  summary: string;
}

/** The agent run (query turn) has started. */
export interface ConversationRunStartedEvent {
  type: 'conversation.run.started';
}

/** The agent run (query turn) has completed successfully. */
export interface ConversationRunCompletedEvent {
  type: 'conversation.run.completed';
  sessionId: string;
}

/** The agent run encountered an error. */
export interface ConversationErrorEvent {
  type: 'conversation.error';
  message: string;
}

export type AgentEvent =
  | ConversationNoticeEvent
  | ConversationMessageStartedEvent
  | ConversationMessageDeltaEvent
  | ConversationMessageCompletedEvent
  | ConversationToolStartedEvent
  | ConversationToolProgressEvent
  | ConversationToolCompletedEvent
  | ConversationRunStartedEvent
  | ConversationRunCompletedEvent
  | ConversationErrorEvent;

// ---------------------------------------------------------------------------
// LifecycleEvent — session-scoped orchestrator lifecycle events
// ---------------------------------------------------------------------------

/** A new lifecycle has started for the current CozyBase session. */
export interface LifecycleStartedEvent {
  type: 'lifecycle.started';
  lifecycleId: string;
}

/** The active lifecycle completed successfully. */
export interface LifecycleCompletedEvent {
  type: 'lifecycle.completed';
  lifecycleId: string;
}

/** The active lifecycle failed and can no longer make progress. */
export interface LifecycleFailedEvent {
  type: 'lifecycle.failed';
  lifecycleId: string;
  message: string;
}

export type LifecycleEvent =
  | LifecycleStartedEvent
  | LifecycleCompletedEvent
  | LifecycleFailedEvent;

// ---------------------------------------------------------------------------
// SessionEvent — application/WebSocket layer events
// ---------------------------------------------------------------------------

/** Sent when a browser WebSocket connects to a session. */
export interface SessionConnectedEvent {
  type: 'session.connected';
  hasSession: boolean;
  streaming: boolean;
}

/** Sent to push persisted message history to a newly connected client. */
export interface SessionHistoryEvent {
  type: 'session.history';
  messages: StoredMessage[];
}

/** Sent after draft content is refreshed to trigger UI reload. */
export interface SessionReconciledEvent {
  type: 'session.reconciled';
  appSlug: string;
}

/** Sent when the server encounters an application-layer error. */
export interface SessionErrorEvent {
  type: 'session.error';
  message: string;
}

export type SessionEvent =
  | SessionConnectedEvent
  | SessionHistoryEvent
  | SessionReconciledEvent
  | SessionErrorEvent;

/** Persisted message shape returned in session.history */
export interface StoredMessage {
  role: 'user' | 'assistant' | 'tool';
  content?: string;
  toolName?: string;
  status?: 'running' | 'done' | 'error';
  summary?: string;
}

export interface ProviderSessionSnapshot {
  providerKind: string;
  version: number;
  state: unknown;
}

export type AgentToolMode = 'mcp' | 'native' | 'none';

export interface AgentProviderCapabilities {
  toolModes: readonly AgentToolMode[];
  supportsResume: boolean;
  supportsWorkingDirectory: boolean;
  supportsContextTransform: boolean;
  supportsHistoryProjection: boolean;
}

export interface AgentSessionSpec {
  systemPrompt?: string;
  model?: unknown;
  cwd?: string;
  toolMode: AgentToolMode;
  mcpConfig?: unknown;
  nativeTools?: unknown[];
  contextPolicy?: {
    maxMessages?: number;
  };
  providerOptions?: unknown;
}

export interface AgentRuntimeSession {
  prompt(text: string): Promise<void>;
  subscribe(listener: (event: AgentEvent) => void): () => void;
  interrupt(): Promise<void>;
  close(): void;
  exportSnapshot(): Promise<ProviderSessionSnapshot | null>;
  restoreSnapshot(snapshot: ProviderSessionSnapshot): Promise<void>;
  getHistory(): Promise<StoredMessage[]>;
}

export interface AgentRuntimeProvider {
  kind: string;
  capabilities: AgentProviderCapabilities;
  createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession>;
  isAvailable(): Promise<boolean>;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// AgentProvider — abstraction over different AI coding agent backends
// ---------------------------------------------------------------------------

/** Configuration for a single agent query. */
export interface AgentQueryConfig {
  /** The user prompt to send to the agent. */
  prompt: string;
  /** Optional system prompt override. */
  systemPrompt?: string;
  /** Working directory for the agent. */
  cwd: string;
  /** Model identifier (provider-specific). */
  model?: string;
  /** Resume a previous session by ID. */
  resumeSessionId?: string | null;
  /** Provider-specific options (e.g. mcpServers, tools, allowedTools). */
  providerOptions?: unknown;
}

/** A handle to an active agent query. Supports async iteration of AgentEvents. */
export interface AgentQuery extends AsyncIterable<AgentEvent> {
  /** Interrupt the currently running agent query. */
  interrupt(): Promise<void>;
  /** Release all underlying resources (process, buffers, etc.). */
  close(): void;
}

/** Factory interface for creating agent queries. */
export interface AgentProvider {
  /** Create a new agent query and return a handle for consuming events. */
  createQuery(config: AgentQueryConfig): AgentQuery;
  /** Check whether this provider is available in the current environment. */
  isAvailable(): Promise<boolean>;
  /** Dispose of any shared resources held by this provider. */
  dispose(): void;
}
