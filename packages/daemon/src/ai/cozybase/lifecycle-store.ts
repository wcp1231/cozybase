export type LifecycleStatus = 'active' | 'completing' | 'completed' | 'failed' | 'cancelled';

export interface LifecycleWaiter {
  waiterId: string;
  source: 'web' | 'acp' | 'system';
}

export type LifecycleInboxEvent =
  | {
      kind: 'user_message';
      text: string;
      createdAt: string;
    }
  | {
      kind: 'task_started';
      taskId: string;
      appSlug: string;
      createdAt: string;
    }
  | {
      kind: 'task_completed';
      taskId: string;
      appSlug: string;
      summary: string;
      createdAt: string;
    }
  | {
      kind: 'task_failed';
      taskId: string;
      appSlug: string;
      error: string;
      createdAt: string;
    }
  | {
      kind: 'system_notice';
      message: string;
      createdAt: string;
    };

export interface LifecycleState {
  lifecycleId: string;
  status: LifecycleStatus;
  events: LifecycleInboxEvent[];
  pendingTaskIds: string[];
  completedTaskIds: string[];
  activeConversationId: string | null;
  waiters: LifecycleWaiter[];
  createdAt: string;
  updatedAt: string;
  failureMessage?: string;
}

export class LifecycleStore {
  private activeLifecycleId: string | null = null;
  private readonly lifecycles = new Map<string, LifecycleState>();
  private readonly taskToLifecycleId = new Map<string, string>();

  ensureActiveLifecycle(): { lifecycle: LifecycleState; created: boolean } {
    const active = this.getActiveLifecycle();
    if (active) {
      return { lifecycle: active, created: false };
    }

    const now = timestamp();
    const lifecycle: LifecycleState = {
      lifecycleId: crypto.randomUUID(),
      status: 'active',
      events: [],
      pendingTaskIds: [],
      completedTaskIds: [],
      activeConversationId: null,
      waiters: [],
      createdAt: now,
      updatedAt: now,
    };
    this.lifecycles.set(lifecycle.lifecycleId, lifecycle);
    this.activeLifecycleId = lifecycle.lifecycleId;
    return { lifecycle, created: true };
  }

  getActiveLifecycle(): LifecycleState | null {
    if (!this.activeLifecycleId) {
      return null;
    }
    return this.lifecycles.get(this.activeLifecycleId) ?? null;
  }

  getLifecycle(lifecycleId: string): LifecycleState | null {
    return this.lifecycles.get(lifecycleId) ?? null;
  }

  getLifecycleForTask(taskId: string): LifecycleState | null {
    const lifecycleId = this.taskToLifecycleId.get(taskId);
    return lifecycleId ? this.getLifecycle(lifecycleId) : null;
  }

  addWaiter(lifecycleId: string, waiter: LifecycleWaiter): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    lifecycle.waiters.push(waiter);
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  enqueueEvent(lifecycleId: string, event: LifecycleInboxEvent): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    lifecycle.events.push(event);
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  shiftEvent(lifecycleId: string): LifecycleInboxEvent | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    const next = lifecycle.events.shift() ?? null;
    if (next) {
      lifecycle.updatedAt = timestamp();
    }
    return next;
  }

  registerTask(lifecycleId: string, taskId: string): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    this.taskToLifecycleId.set(taskId, lifecycleId);
    if (!lifecycle.pendingTaskIds.includes(taskId)) {
      lifecycle.pendingTaskIds.push(taskId);
    }
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  markTaskTerminal(taskId: string): LifecycleState | null {
    const lifecycle = this.getLifecycleForTask(taskId);
    if (!lifecycle) {
      return null;
    }
    if (!lifecycle.pendingTaskIds.includes(taskId)) {
      return null;
    }
    lifecycle.pendingTaskIds = lifecycle.pendingTaskIds.filter((id) => id !== taskId);
    if (!lifecycle.completedTaskIds.includes(taskId)) {
      lifecycle.completedTaskIds.push(taskId);
    }
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  startConversation(lifecycleId: string, conversationId = crypto.randomUUID()): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle || lifecycle.activeConversationId) {
      return null;
    }
    lifecycle.activeConversationId = conversationId;
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  finishConversation(lifecycleId: string): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    lifecycle.activeConversationId = null;
    lifecycle.updatedAt = timestamp();
    return lifecycle;
  }

  canComplete(lifecycleId: string): boolean {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return false;
    }
    return lifecycle.activeConversationId === null
      && lifecycle.events.length === 0
      && lifecycle.pendingTaskIds.length === 0
      && lifecycle.status === 'active';
  }

  completeLifecycle(lifecycleId: string): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    lifecycle.status = 'completed';
    lifecycle.activeConversationId = null;
    lifecycle.updatedAt = timestamp();
    if (this.activeLifecycleId === lifecycleId) {
      this.activeLifecycleId = null;
    }
    return lifecycle;
  }

  failLifecycle(lifecycleId: string, message: string): LifecycleState | null {
    const lifecycle = this.getLifecycle(lifecycleId);
    if (!lifecycle) {
      return null;
    }
    lifecycle.status = 'failed';
    lifecycle.failureMessage = message;
    lifecycle.activeConversationId = null;
    lifecycle.updatedAt = timestamp();
    if (this.activeLifecycleId === lifecycleId) {
      this.activeLifecycleId = null;
    }
    return lifecycle;
  }
}

function timestamp(): string {
  return new Date().toISOString();
}
