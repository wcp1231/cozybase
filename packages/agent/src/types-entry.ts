/**
 * Types-only entry point for use in browser/Vite environments.
 * Does NOT export ClaudeCodeProvider to avoid pulling in Node.js dependencies.
 */
export type {
  // AgentEvent union and variants
  AgentEvent,
  ConversationNoticeEvent,
  ConversationMessageStartedEvent,
  ConversationMessageDeltaEvent,
  ConversationMessageCompletedEvent,
  ConversationToolStartedEvent,
  ConversationToolProgressEvent,
  ConversationToolCompletedEvent,
  ConversationRunStartedEvent,
  ConversationRunCompletedEvent,
  ConversationErrorEvent,
  // SessionEvent union and variants
  SessionEvent,
  SessionConnectedEvent,
  SessionHistoryEvent,
  SessionReconciledEvent,
  SessionErrorEvent,
  StoredMessage,
  // Provider interfaces (type-only, no runtime implementation)
  AgentProvider,
  AgentQuery,
  AgentQueryConfig,
} from './types.js';
