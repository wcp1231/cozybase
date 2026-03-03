/**
 * ChatSessionManager — Manages per-app ChatSession lifecycle.
 *
 * Sessions are created lazily when a WebSocket connection arrives.
 * The manager is the single entry point used by server.ts and index.ts.
 */

import { ChatSession, type ChatSessionConfig } from './chat-session';
import type { SessionStore } from './session-store';

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  private config: ChatSessionConfig;
  private store: SessionStore;

  constructor(config: ChatSessionConfig, store: SessionStore) {
    this.config = config;
    this.store = store;
  }

  /**
   * Get or create a ChatSession for the given app.
   * On first access, restores the SDK session ID from the store.
   */
  getOrCreate(appName: string): ChatSession {
    let session = this.sessions.get(appName);
    if (!session) {
      const sdkSessionId = this.store.getSessionId(appName);
      session = new ChatSession(appName, this.config, this.store, sdkSessionId);
      this.sessions.set(appName, session);
    }
    return session;
  }

  /**
   * Get an existing ChatSession (returns undefined if not loaded).
   */
  get(appName: string): ChatSession | undefined {
    return this.sessions.get(appName);
  }

  /**
   * Remove and shutdown a session (e.g., when an app is deleted or renamed).
   */
  remove(appName: string): void {
    const session = this.sessions.get(appName);
    if (session) {
      session.shutdown();
      this.sessions.delete(appName);
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
