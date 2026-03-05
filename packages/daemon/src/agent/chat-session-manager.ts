/**
 * ChatSessionManager — Manages per-app ChatSession lifecycle.
 *
 * Sessions are created lazily when a WebSocket connection arrives.
 * The manager is the single entry point used by server.ts and index.ts.
 */

import { ChatSession, type ChatSessionConfig } from './chat-session';
import type { SessionStore } from './session-store';
import type { EventBus } from '../core/event-bus';

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  private config: ChatSessionConfig;
  private store: SessionStore;
  private eventBus?: EventBus;

  constructor(config: ChatSessionConfig, store: SessionStore, eventBus?: EventBus) {
    this.config = config;
    this.store = store;
    this.eventBus = eventBus;
  }

  /**
   * Get or create a ChatSession for the given app.
   * On first access, restores the SDK session ID from the store.
   */
  getOrCreate(appSlug: string): ChatSession {
    let session = this.sessions.get(appSlug);
    if (!session) {
      const storedSession = this.store.getSession(appSlug);
      let sdkSessionId = storedSession?.sdkSessionId ?? null;

      if (
        sdkSessionId &&
        storedSession?.providerKind &&
        storedSession.providerKind !== this.config.providerKind
      ) {
        // Claude session IDs and Codex thread IDs are not interchangeable.
        // Clear stale resume state to avoid opaque provider-specific errors.
        this.store.clearSessionId(appSlug);
        sdkSessionId = null;
      }

      session = new ChatSession(appSlug, this.config, this.store, sdkSessionId, this.eventBus);
      this.sessions.set(appSlug, session);
    }
    return session;
  }

  /**
   * Get an existing ChatSession (returns undefined if not loaded).
   */
  get(appSlug: string): ChatSession | undefined {
    return this.sessions.get(appSlug);
  }

  /**
   * Remove and shutdown a session (e.g., when an app is deleted or renamed).
   */
  remove(appSlug: string): void {
    const session = this.sessions.get(appSlug);
    if (session) {
      session.shutdown();
      this.sessions.delete(appSlug);
    }
  }

  /**
   * Shutdown all sessions. Called during daemon graceful shutdown.
   */
  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.shutdown();
    }
    this.sessions.clear();
  }
}
