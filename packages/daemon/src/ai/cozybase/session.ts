import type {
  AgentEvent,
  AgentQuery,
  LifecycleEvent,
  SessionEvent,
  StoredMessage,
} from '@cozybase/ai-runtime';
import type { DelegatedTask } from '@cozybase/cozybase-agent';
import { buildCozyBaseSystemPrompt } from '@cozybase/cozybase-agent';
import type {
  EventBus,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskStartedEvent,
} from '../../core/event-bus';
import type { RuntimeSessionStore } from '../runtime-session-store';
import type { CozyBaseRuntimeConfig } from './config';
import {
  LifecycleStore,
  type LifecycleInboxEvent,
  type LifecycleState,
} from './lifecycle-store';
import { daemonLogger } from '../../core/daemon-logger';

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

type WireEvent = AgentEvent | LifecycleEvent | SessionEvent;

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
  getTask: (taskId: string) => DelegatedTask | null;
}

const COZYBASE_APP_SLUG = '__cozybase__';
const TASK_POLL_INTERVAL_MS = 500;

export class CozyBaseSession {
  private ws: WebSocketLike | null = null;
  private streaming = false;
  private runEventBuffer: WireEvent[] = [];
  private activeQuery: AgentQuery | null = null;
  private resumeSessionId: string | null = null;
  private runtimeProviderKind: string | null = null;
  private history: StoredMessage[] = [];
  private readonly lifecycleStore = new LifecycleStore();
  private processingPromise: Promise<void> | null = null;
  private taskPollTimer: ReturnType<typeof setInterval> | null = null;
  private currentConversationLifecycleId: string | null = null;
  private lastConversationError: string | null = null;
  private readonly unsubscribeStarted: () => void;
  private readonly unsubscribeCompleted: () => void;
  private readonly unsubscribeFailed: () => void;

  constructor(private readonly config: CozyBaseSessionConfig) {
    this.unsubscribeStarted = this.config.eventBus.on('task:started', (event) => {
      this.handleTaskStarted(event);
    });
    this.unsubscribeCompleted = this.config.eventBus.on('task:completed', (event) => {
      this.handleTaskCompleted(event);
    });
    this.unsubscribeFailed = this.config.eventBus.on('task:failed', (event) => {
      this.handleTaskFailed(event);
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
    if (!text.trim()) {
      return;
    }

    const { lifecycle, created } = this.lifecycleStore.ensureActiveLifecycle();
    if (created) {
      this.sendLifecycleEvent({
        type: 'lifecycle.started',
        lifecycleId: lifecycle.lifecycleId,
      });
    }

    this.history.push({ role: 'user', content: text });
    this.lifecycleStore.enqueueEvent(lifecycle.lifecycleId, {
      kind: 'user_message',
      text,
      createdAt: new Date().toISOString(),
    });
    this.ensureProcessingLoop();
  }

  async injectPrompt(text: string): Promise<void> {
    await this.prompt(text);
  }

  registerDelegatedTask(taskId: string): void {
    const lifecycle = this.lifecycleStore.getActiveLifecycle();
    if (!lifecycle) {
      return;
    }
    this.lifecycleStore.registerTask(lifecycle.lifecycleId, taskId);
    const task = this.config.getTask(taskId);
    if (task?.status === 'running') {
      this.handleTaskStarted({
        taskId: task.taskId,
        appSlug: task.appSlug,
      });
    } else if (task?.status === 'completed') {
      this.handleTaskCompleted({
        taskId: task.taskId,
        appSlug: task.appSlug,
        summary: task.summary ?? '',
      });
    } else if (task?.status === 'failed') {
      this.handleTaskFailed({
        taskId: task.taskId,
        appSlug: task.appSlug,
        error: task.error ?? 'Task failed',
      });
    }
    this.ensureTaskPolling();
  }

  getActiveLifecycleId(): string | null {
    return this.lifecycleStore.getActiveLifecycle()?.lifecycleId ?? null;
  }

  shutdown(): void {
    this.unsubscribeStarted();
    this.unsubscribeCompleted();
    this.unsubscribeFailed();
    this.activeQuery?.close();
    this.activeQuery = null;
    this.ws = null;
    this.streaming = false;
    this.runEventBuffer = [];
    this.stopTaskPolling();
    this.processingPromise = null;
    this.currentConversationLifecycleId = null;
    this.lastConversationError = null;
  }

  private handleTaskStarted(event: TaskStartedEvent): void {
    const lifecycle = this.lifecycleStore.getLifecycleForTask(event.taskId);
    if (!lifecycle) {
      return;
    }
    this.lifecycleStore.enqueueEvent(lifecycle.lifecycleId, {
      kind: 'task_started',
      taskId: event.taskId,
      appSlug: event.appSlug,
      createdAt: new Date().toISOString(),
    });
    this.ensureProcessingLoop();
  }

  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const lifecycle = this.lifecycleStore.markTaskTerminal(event.taskId);
    if (!lifecycle) {
      return;
    }
    this.lifecycleStore.enqueueEvent(lifecycle.lifecycleId, {
      kind: 'task_completed',
      taskId: event.taskId,
      appSlug: event.appSlug,
      summary: event.summary,
      createdAt: new Date().toISOString(),
    });
    this.ensureProcessingLoop();
  }

  private handleTaskFailed(event: TaskFailedEvent): void {
    const lifecycle = this.lifecycleStore.markTaskTerminal(event.taskId);
    if (!lifecycle) {
      return;
    }
    this.lifecycleStore.enqueueEvent(lifecycle.lifecycleId, {
      kind: 'task_failed',
      taskId: event.taskId,
      appSlug: event.appSlug,
      error: event.error,
      createdAt: new Date().toISOString(),
    });
    this.ensureProcessingLoop();
  }

  private ensureProcessingLoop(): void {
    if (this.processingPromise) {
      return;
    }

    this.processingPromise = this.processLifecycleQueue()
      .catch((error) => {
        const lifecycle = this.lifecycleStore.getActiveLifecycle();
        if (!lifecycle) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        this.failLifecycle(lifecycle, message);
      })
      .finally(() => {
        this.processingPromise = null;
        const lifecycle = this.lifecycleStore.getActiveLifecycle();
        if (lifecycle && lifecycle.events.length > 0 && !lifecycle.activeConversationId) {
          this.ensureProcessingLoop();
        }
      });
  }

  private async processLifecycleQueue(): Promise<void> {
    while (true) {
      const lifecycle = this.lifecycleStore.getActiveLifecycle();
      if (!lifecycle) {
        this.stopTaskPolling();
        return;
      }

      if (lifecycle.activeConversationId) {
        return;
      }

      const next = this.lifecycleStore.shiftEvent(lifecycle.lifecycleId);
      if (!next) {
        if (this.lifecycleStore.canComplete(lifecycle.lifecycleId)) {
          this.lifecycleStore.completeLifecycle(lifecycle.lifecycleId);
          this.sendLifecycleEvent({
            type: 'lifecycle.completed',
            lifecycleId: lifecycle.lifecycleId,
          });
          this.stopTaskPolling();
          this.persistSnapshot();
        } else if (lifecycle.pendingTaskIds.length > 0) {
          this.ensureTaskPolling();
        } else {
          this.stopTaskPolling();
        }
        return;
      }

      const promptText = this.buildConversationInput(next);
      if (!promptText) {
        continue;
      }

      if (!this.lifecycleStore.startConversation(lifecycle.lifecycleId)) {
        return;
      }

      try {
        await this.runConversation(lifecycle.lifecycleId, promptText);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.failLifecycle(lifecycle, message);
        return;
      } finally {
        this.lifecycleStore.finishConversation(lifecycle.lifecycleId);
      }
    }
  }

  private async runConversation(lifecycleId: string, text: string): Promise<void> {
    const runtime = this.config.runtimeResolver();
    const providerOptions = await this.config.providerOptionsResolver(runtime.providerKind);

    this.streaming = true;
    this.runEventBuffer = [];
    this.runtimeProviderKind = runtime.providerKind;
    this.currentConversationLifecycleId = lifecycleId;
    this.lastConversationError = null;

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
      daemonLogger.error('[cozybase] conversation error', {
        lifecycleId,
        providerKind: runtime.providerKind,
        message,
      });
      const event: AgentEvent = { type: 'conversation.error', message };
      this.handleRuntimeEvent(event);
      this.runEventBuffer.push(event);
      this.sendToWs(event);
    } finally {
      this.activeQuery = null;
      this.currentConversationLifecycleId = null;
      this.streaming = false;
      this.runEventBuffer = [];
      this.persistSnapshot();
    }

    if (this.lastConversationError) {
      throw new Error(this.lastConversationError);
    }
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
        this.lastConversationError = event.message;
        break;
      default:
        break;
    }
  }

  private buildConversationInput(event: LifecycleInboxEvent): string | null {
    switch (event.kind) {
      case 'user_message':
        return event.text;
      case 'task_completed':
        return buildCompletionNotification({
          taskId: event.taskId,
          appSlug: event.appSlug,
          summary: event.summary,
        });
      case 'task_failed':
        return buildFailureNotification({
          taskId: event.taskId,
          appSlug: event.appSlug,
          error: event.error,
        });
      case 'system_notice':
        return event.message;
      case 'task_started':
        return null;
      default:
        return null;
    }
  }

  private ensureTaskPolling(): void {
    if (this.taskPollTimer) {
      return;
    }

    this.taskPollTimer = setInterval(() => {
      void this.pollPendingTasks();
    }, TASK_POLL_INTERVAL_MS);
  }

  private stopTaskPolling(): void {
    if (!this.taskPollTimer) {
      return;
    }
    clearInterval(this.taskPollTimer);
    this.taskPollTimer = null;
  }

  private async pollPendingTasks(): Promise<void> {
    const lifecycle = this.lifecycleStore.getActiveLifecycle();
    if (!lifecycle || lifecycle.pendingTaskIds.length === 0) {
      this.stopTaskPolling();
      return;
    }

    for (const taskId of [...lifecycle.pendingTaskIds]) {
      const task = this.config.getTask(taskId);
      if (!task) {
        continue;
      }
      if (task.status === 'completed') {
        this.handleTaskCompleted({
          taskId: task.taskId,
          appSlug: task.appSlug,
          summary: task.summary ?? '',
        });
        continue;
      }
      if (task.status === 'failed') {
        this.handleTaskFailed({
          taskId: task.taskId,
          appSlug: task.appSlug,
          error: task.error ?? 'Task failed',
        });
      }
    }
  }

  private failLifecycle(lifecycle: LifecycleState, message: string): void {
    daemonLogger.error('[cozybase] lifecycle failed', {
      lifecycleId: lifecycle.lifecycleId,
      message,
    });
    this.lifecycleStore.failLifecycle(lifecycle.lifecycleId, message);
    this.sendLifecycleEvent({
      type: 'lifecycle.failed',
      lifecycleId: lifecycle.lifecycleId,
      message,
    });
    this.stopTaskPolling();
    this.persistSnapshot();
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

  private sendLifecycleEvent(event: LifecycleEvent): void {
    this.sendToWs(event);
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
