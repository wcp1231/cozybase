import type {
  AgentEvent,
  AgentQuery,
  SessionEvent,
  StoredMessage,
} from '@cozybase/ai-runtime';
import { buildCozyBaseSystemPrompt } from '@cozybase/cozybase-agent';
import type { EventBus, TaskCompletedEvent, TaskFailedEvent } from '../../core/event-bus';
import type { RuntimeSessionStore } from '../runtime-session-store';
import type { CozyBaseRuntimeConfig } from './config';

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

type WireEvent = AgentEvent | SessionEvent;

type ChatInboundMessage =
  | { type: 'chat:send'; message: string }
  | { type: 'chat:cancel' }
  | { type: 'prompt'; text: string };

interface CozyBaseSessionConfig {
  runtimeStore: RuntimeSessionStore;
  runtimeResolver: () => CozyBaseRuntimeConfig;
  providerOptionsResolver: (providerKind: CozyBaseRuntimeConfig['providerKind']) => Promise<unknown>;
  eventBus: EventBus;
  cwd: string;
}

const COZYBASE_APP_SLUG = '__cozybase__';

export class CozyBaseSession {
  private ws: WebSocketLike | null = null;
  private streaming = false;
  private runEventBuffer: WireEvent[] = [];
  private activeQuery: AgentQuery | null = null;
  private resumeSessionId: string | null = null;
  private runtimeProviderKind: string | null = null;
  private history: StoredMessage[] = [];
  private notificationQueue: string[] = [];
  private flushPromise: Promise<void> | null = null;
  private readonly unsubscribeCompleted: () => void;
  private readonly unsubscribeFailed: () => void;

  constructor(private readonly config: CozyBaseSessionConfig) {
    this.unsubscribeCompleted = this.config.eventBus.on('task:completed', (event) => {
      this.enqueueTaskNotification(buildCompletionNotification(event));
    });
    this.unsubscribeFailed = this.config.eventBus.on('task:failed', (event) => {
      this.enqueueTaskNotification(buildFailureNotification(event));
    });
  }

  connect(ws: WebSocketLike): void {
    this.ws = ws;
    const runtime = this.config.runtimeResolver();
    const hasSession = this.hasCompatibleStoredSession(runtime.providerKind);
    this.history = this.config.runtimeStore.getProjectedHistory('cozybase', COZYBASE_APP_SLUG);

    this.sendToWs({
      type: 'session.connected',
      hasSession,
      streaming: this.streaming,
    });

    if (this.history.length > 0) {
      this.sendToWs({
        type: 'session.history',
        messages: this.history,
      });
    }

    if (this.streaming && this.runEventBuffer.length > 0) {
      for (const event of this.runEventBuffer) {
        this.sendToWs(event);
      }
    }
  }

  disconnect(ws: WebSocketLike): void {
    if (this.ws === ws) {
      this.ws = null;
    }
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
        await this.activeQuery?.interrupt();
        break;
      default:
        this.sendToWs({ type: 'session.error', message: `Unknown message type: ${(payload as { type?: string }).type ?? 'unknown'}` });
        break;
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

    const runtime = this.config.runtimeResolver();
    const providerOptions = await this.config.providerOptionsResolver(runtime.providerKind);

    this.streaming = true;
    this.runEventBuffer = [];
    this.history.push({ role: 'user', content: text });
    this.runtimeProviderKind = runtime.providerKind;

    try {
      const query = runtime.agentProvider.createQuery({
        prompt: text,
        systemPrompt: buildCozyBaseSystemPrompt(),
        cwd: this.config.cwd,
        model: runtime.model,
        resumeSessionId: this.resumeSessionId,
        providerOptions,
      });
      this.activeQuery = query;

      for await (const event of query) {
        this.handleRuntimeEvent(event);
        this.runEventBuffer.push(event);
        this.sendToWs(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const event: AgentEvent = { type: 'conversation.error', message };
      this.runEventBuffer.push(event);
      this.sendToWs(event);
    } finally {
      this.activeQuery = null;
      this.streaming = false;
      this.runEventBuffer = [];
      this.persistSnapshot();
      void this.flushNotifications();
    }
  }

  async injectPrompt(text: string): Promise<void> {
    await this.prompt(text);
  }

  shutdown(): void {
    this.unsubscribeCompleted();
    this.unsubscribeFailed();
    this.activeQuery?.close();
    this.activeQuery = null;
    this.ws = null;
    this.streaming = false;
    this.runEventBuffer = [];
    this.notificationQueue = [];
    this.flushPromise = null;
  }

  private enqueueTaskNotification(message: string): void {
    this.notificationQueue.push(message);
    void this.flushNotifications();
  }

  private async flushNotifications(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    const run = async () => {
      while (!this.streaming && this.notificationQueue.length > 0) {
        const message = this.notificationQueue.shift();
        if (!message) {
          continue;
        }
        await this.injectPrompt(message);
      }
    };

    this.flushPromise = run().finally(() => {
      if (this.flushPromise) {
        this.flushPromise = null;
      }
    });
    return this.flushPromise;
  }

  private handleRuntimeEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'conversation.run.started':
        this.streaming = true;
        break;
      case 'conversation.message.completed':
        if (event.role === 'assistant') {
          this.history.push({ role: 'assistant', content: event.content });
        }
        break;
      case 'conversation.tool.completed':
        this.history.push({
          role: 'tool',
          toolName: event.toolName,
          status: 'done',
          summary: event.summary,
        });
        break;
      case 'conversation.run.completed':
        this.resumeSessionId = event.sessionId || this.resumeSessionId;
        this.streaming = false;
        break;
      case 'conversation.error':
        this.streaming = false;
        break;
      default:
        break;
    }
  }

  private persistSnapshot(): void {
    if (!this.runtimeProviderKind) {
      return;
    }

    this.config.runtimeStore.saveSession('cozybase', COZYBASE_APP_SLUG, this.runtimeProviderKind, {
      providerKind: this.runtimeProviderKind,
      version: 1,
      state: {
        resumeSessionId: this.resumeSessionId,
        history: this.history,
      },
    });
  }

  private hasCompatibleStoredSession(providerKind: string): boolean {
    const storedSession = this.config.runtimeStore.getSession('cozybase', COZYBASE_APP_SLUG);
    if (!storedSession) {
      this.resumeSessionId = null;
      this.history = [];
      return false;
    }
    if (storedSession.providerKind === providerKind) {
      const state = (storedSession.snapshot.state ?? {}) as {
        resumeSessionId?: unknown;
      };
      this.resumeSessionId = typeof state.resumeSessionId === 'string' ? state.resumeSessionId : null;
      return true;
    }
    this.config.runtimeStore.clearSession('cozybase', COZYBASE_APP_SLUG);
    this.resumeSessionId = null;
    this.history = [];
    return false;
  }

  private sendToWs(data: WireEvent | { type: 'session.error'; message: string }): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(data));
    }
  }
}

function buildCompletionNotification(event: TaskCompletedEvent): string {
  return `[系统通知] APP "${event.appSlug}" 的后台任务已完成：${event.summary}\n\n请将此结果告知用户。`;
}

function buildFailureNotification(event: TaskFailedEvent): string {
  return `[系统通知] APP "${event.appSlug}" 的后台任务执行失败：${event.error}\n\n请向用户说明失败原因，并在合适时建议下一步。`;
}
