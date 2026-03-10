import { ChatSession, type ChatSessionConfig } from './session';
import type { SessionStore } from './session-store';
import type { EventBus } from '../../core/event-bus';
import type { RuntimeSessionStore } from '../runtime-session-store';

export class ChatSessionManager {
  private sessions = new Map<string, ChatSession>();
  private config: ChatSessionConfig;
  private store: SessionStore;
  private runtimeStore: RuntimeSessionStore;
  private eventBus?: EventBus;

  constructor(config: ChatSessionConfig, store: SessionStore, runtimeStore: RuntimeSessionStore, eventBus?: EventBus) {
    this.config = config;
    this.store = store;
    this.runtimeStore = runtimeStore;
    this.eventBus = eventBus;
  }

  /**
   * Get or create a ChatSession for the given app.
   * On first access, restores the SDK session ID from the store.
   */
  getOrCreate(appSlug: string): ChatSession {
    let session = this.sessions.get(appSlug);
    if (!session) {
      session = new ChatSession(appSlug, this.config, this.store, this.runtimeStore, this.eventBus);
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
    this.runtimeStore.clearSession('builder', appSlug);
    this.store.deleteSession(appSlug);
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

  private resolveRuntimeConfig() {
    return this.config.runtimeResolver?.() ?? this.config;
  }
}
