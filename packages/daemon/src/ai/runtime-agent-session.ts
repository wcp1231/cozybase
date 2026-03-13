import type {
  AgentEvent,
  AgentRuntimeProvider,
  AgentRuntimeSession,
  AgentSessionSpec,
  SessionEvent,
  StoredMessage,
} from '@cozybase/ai-runtime';
import type { RuntimeSessionStore, RuntimeSessionUsageType } from './runtime-session-store';
import { daemonLogger } from '../core/daemon-logger';

export type ChatInboundMessage =
  | { type: 'chat:send'; message: string }
  | { type: 'chat:cancel' }
  | { type: 'prompt'; text: string };

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

type RuntimeConfigLike = {
  agentProvider: AgentRuntimeProvider;
  providerKind: string;
};

type WireEvent = AgentEvent | SessionEvent;

export abstract class RuntimeAgentSession<TRuntimeConfig extends RuntimeConfigLike> {
  readonly appSlug: string;
  delegatedTaskId: string | null = null;

  protected ws: WebSocketLike | null = null;
  protected streaming = false;
  protected runtimeSession: AgentRuntimeSession | null = null;
  protected runtimeSessionPromise: Promise<AgentRuntimeSession> | null = null;
  protected runEventBuffer: WireEvent[] = [];
  protected runtimeProviderKind: string | null = null;
  protected lastPromptError: string | null = null;

  constructor(
    appSlug: string,
    protected readonly runtimeStore: RuntimeSessionStore,
    private readonly runtimeResolver: () => TRuntimeConfig,
  ) {
    this.appSlug = appSlug;
  }

  connect(ws: WebSocketLike): void {
    this.ws = ws;
    const runtime = this.resolveRuntimeConfig();
    const hasSession = this.hasCompatibleStoredSession(runtime.providerKind);
    const history = this.loadPersistedHistory();

    this.sendToWs({
      type: 'session.connected',
      hasSession,
      streaming: this.streaming,
    });

    if (history.length > 0) {
      this.sendToWs({
        type: 'session.history',
        messages: history,
      });
    }

    if (this.streaming && this.runEventBuffer.length > 0) {
      for (const event of this.runEventBuffer) {
        this.sendToWs(event);
      }
    }

    this.afterConnect();
  }

  async handleMessage(ws: WebSocketLike, raw: string): Promise<void> {
    if (this.ws !== ws) {
      this.ws = ws;
    }

    let payload: ChatInboundMessage;
    try {
      payload = JSON.parse(raw);
    } catch {
      this.sendToWs({ type: 'session.error', message: 'Invalid JSON' });
      return;
    }

    switch (payload.type) {
      case 'chat:send':
        await this.prompt(payload.message);
        break;
      case 'prompt':
        await this.prompt(payload.text);
        break;
      case 'chat:cancel':
        await this.handleCancel();
        break;
      default:
        this.sendToWs({ type: 'session.error', message: `Unknown message type: ${(payload as { type?: string }).type ?? 'unknown'}` });
        break;
    }
  }

  disconnect(ws: WebSocketLike): void {
    if (this.ws === ws) {
      this.ws = null;
    }
  }

  async prompt(text: string): Promise<void> {
    if (this.streaming) {
      this.sendToWs({ type: 'session.error', message: 'Agent is busy processing a previous message' });
      return;
    }

    if (!text.trim()) {
      return;
    }

    this.streaming = true;
    this.runEventBuffer = [];
    this.lastPromptError = null;

    try {
      await this.beforePrompt(text);
      const runtimeSession = await this.ensureRuntimeSession();
      await runtimeSession.prompt(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.lastPromptError = message;
      this.logClaudePromptFailure(message);
      this.sendToWs({ type: 'conversation.error', message });
      this.onPromptError(message);
    } finally {
      await this.persistSnapshot();
      this.afterPrompt();
      this.streaming = false;
    }
  }

  async injectPrompt(text: string): Promise<void> {
    if (this.streaming) {
      throw new Error('Agent is busy processing a previous message');
    }
    await this.prompt(text);
  }

  shutdown(): void {
    this.runtimeUnsubscribe?.();
    this.runtimeUnsubscribe = null;
    this.runtimeSessionPromise = null;
    this.runtimeSession?.close();
    this.runtimeSession = null;
    this.ws = null;
    this.streaming = false;
    this.runEventBuffer = [];
    this.runtimeProviderKind = null;
    this.onShutdown();
  }

  protected runtimeUnsubscribe: (() => void) | null = null;

  protected resolveRuntimeConfig(): TRuntimeConfig {
    return this.runtimeResolver();
  }

  protected sendToWs(data: WireEvent | { type: 'session.error' | 'conversation.error'; message: string }): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }

  protected loadPersistedHistory(): StoredMessage[] {
    return this.runtimeStore.getProjectedHistory(this.getUsageType(), this.appSlug);
  }

  protected async handleCancel(): Promise<void> {
    const runtimeSession = this.runtimeSession
      ?? (this.runtimeSessionPromise ? await this.runtimeSessionPromise.catch(() => null) : null);
    await runtimeSession?.interrupt();
  }

  protected async ensureRuntimeSession(): Promise<AgentRuntimeSession> {
    if (this.runtimeSession) {
      return this.runtimeSession;
    }

    if (this.runtimeSessionPromise) {
      return this.runtimeSessionPromise;
    }

    const pending = (async () => {
      const runtime = this.resolveRuntimeConfig();
      const sessionSpec = await this.buildSessionSpec(runtime);
      const session = await runtime.agentProvider.createSession(sessionSpec);

      const storedSession = this.runtimeStore.getSession(this.getUsageType(), this.appSlug);
      if (storedSession?.providerKind === runtime.providerKind) {
        await session.restoreSnapshot(storedSession.snapshot);
      } else if (storedSession?.providerKind && storedSession.providerKind !== runtime.providerKind) {
        this.runtimeStore.clearSession(this.getUsageType(), this.appSlug);
      }

      this.runtimeProviderKind = runtime.providerKind;
      this.runtimeSession = session;
      this.runtimeUnsubscribe = session.subscribe((event) => {
        this.runEventBuffer.push(event);
        this.sendToWs(event);
        this.onRuntimeEvent(event);
        if (event.type === 'conversation.run.started') {
          this.streaming = true;
        }
        if (event.type === 'conversation.run.completed' || event.type === 'conversation.error') {
          this.streaming = false;
        }
      });

      return session;
    })();

    this.runtimeSessionPromise = pending;
    try {
      return await pending;
    } finally {
      if (this.runtimeSessionPromise === pending) {
        this.runtimeSessionPromise = null;
      }
    }
  }

  private async persistSnapshot(): Promise<void> {
    if (!this.runtimeSession || !this.runtimeProviderKind) {
      return;
    }
    const snapshot = await this.runtimeSession.exportSnapshot();
    if (!snapshot) {
      return;
    }
    this.runtimeStore.saveSession(this.getUsageType(), this.appSlug, this.runtimeProviderKind, snapshot);
  }

  private hasCompatibleStoredSession(providerKind: string): boolean {
    const storedSession = this.runtimeStore.getSession(this.getUsageType(), this.appSlug);
    if (!storedSession) {
      return false;
    }
    if (storedSession.providerKind === providerKind) {
      return true;
    }
    this.runtimeStore.clearSession(this.getUsageType(), this.appSlug);
    this.onIncompatibleStoredSessionCleared(storedSession.providerKind, providerKind);
    return false;
  }

  protected afterConnect(): void {}

  protected beforePrompt(_text: string): Promise<void> | void {}

  protected afterPrompt(): void {}

  protected onPromptError(_message: string): void {}

  protected onRuntimeEvent(_event: AgentEvent): void {}

  protected onIncompatibleStoredSessionCleared(_previousProviderKind: string, _providerKind: string): void {}

  protected onShutdown(): void {}

  protected abstract getUsageType(): RuntimeSessionUsageType;

  protected abstract buildSessionSpec(runtime: TRuntimeConfig): Promise<AgentSessionSpec>;

  private isClaudeProviderKind(providerKind: string | null): boolean {
    return providerKind === 'claude' || providerKind === 'claude-code';
  }

  private logClaudePromptFailure(message: string): void {
    const providerKind = this.runtimeProviderKind ?? this.resolveRuntimeConfig().providerKind;
    if (!this.isClaudeProviderKind(providerKind)) {
      return;
    }

    daemonLogger.error('[agent] claude prompt failed', {
      usageType: this.getUsageType(),
      appSlug: this.appSlug,
      providerKind,
      message,
    });
  }
}
