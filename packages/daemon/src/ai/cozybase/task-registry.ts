import type {
  DelegatedTask,
  DelegatedTaskStatus,
  DelegatedTaskTarget,
  DelegatedTaskType,
  QueueStatus,
} from '@cozybase/cozybase-agent';
import type { EventBus, TaskFailedEvent } from '../../core/event-bus';

type TaskExecutor = (task: DelegatedTask) => Promise<void>;

interface QueueEntry {
  key: string;
  taskIds: string[];
}

export interface EnqueueTaskInput {
  appSlug: string;
  type: DelegatedTaskType;
  target: DelegatedTaskTarget;
  instruction: string;
}

export class TaskRegistry {
  private readonly tasks = new Map<string, DelegatedTask>();
  private readonly queues = new Map<string, QueueEntry>();
  private readonly executors: Record<DelegatedTaskTarget, TaskExecutor>;
  private readonly unsubscribeCompleted: () => void;
  private readonly unsubscribeFailed: () => void;

  constructor(
    private readonly eventBus: EventBus,
    executors: Record<DelegatedTaskTarget, TaskExecutor>,
  ) {
    this.executors = executors;
    this.unsubscribeCompleted = this.eventBus.on('task:completed', (event) => {
      this.markCompleted(event.taskId, event.summary);
    });
    this.unsubscribeFailed = this.eventBus.on('task:failed', (event) => {
      this.markFailed(event.taskId, event.error);
    });
  }

  enqueue(input: EnqueueTaskInput): DelegatedTask {
    const task: DelegatedTask = {
      taskId: crypto.randomUUID(),
      appSlug: input.appSlug,
      type: input.type,
      target: input.target,
      instruction: input.instruction,
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    const key = queueKey(input.appSlug, input.target);
    const queue = this.getOrCreateQueue(key);
    const hasRunningTask = queue.taskIds.some((taskId) => this.tasks.get(taskId)?.status === 'running');

    if (!hasRunningTask) {
      task.status = 'running';
      task.startedAt = new Date().toISOString();
    }

    this.tasks.set(task.taskId, task);
    queue.taskIds.push(task.taskId);

    if (task.status === 'running') {
      this.startTask(task);
    }

    return { ...task };
  }

  markCompleted(taskId: string, summary: string): DelegatedTask | null {
    return this.finishTask(taskId, 'completed', { summary });
  }

  markFailed(taskId: string, error: string): DelegatedTask | null {
    return this.finishTask(taskId, 'failed', { error });
  }

  getTask(taskId: string): DelegatedTask | null {
    const task = this.tasks.get(taskId);
    return task ? { ...task } : null;
  }

  getQueueStatus(appSlug: string, target: DelegatedTaskTarget): QueueStatus {
    const key = queueKey(appSlug, target);
    const queue = this.queues.get(key);
    const tasks = (queue?.taskIds ?? [])
      .map((taskId) => this.tasks.get(taskId))
      .filter((task): task is DelegatedTask => Boolean(task))
      .map((task) => ({ ...task }));

    return {
      key,
      appSlug,
      target,
      runningTaskId: tasks.find((task) => task.status === 'running')?.taskId ?? null,
      queuedTaskIds: tasks.filter((task) => task.status === 'queued').map((task) => task.taskId),
      tasks,
    };
  }

  shutdown(): void {
    this.unsubscribeCompleted();
    this.unsubscribeFailed();
  }

  private finishTask(
    taskId: string,
    status: Extract<DelegatedTaskStatus, 'completed' | 'failed'>,
    result: { summary?: string; error?: string },
  ): DelegatedTask | null {
    const task = this.tasks.get(taskId);
    if (!task || (task.status !== 'running' && task.status !== 'queued')) {
      return task ? { ...task } : null;
    }

    task.status = status;
    task.completedAt = new Date().toISOString();
    task.summary = result.summary;
    task.error = result.error;

    const key = queueKey(task.appSlug, task.target);
    const queue = this.queues.get(key);
    if (!queue) {
      return { ...task };
    }

    queue.taskIds = queue.taskIds.filter((queuedTaskId) => queuedTaskId !== taskId);
    this.startNextQueuedTask(queue);
    return { ...task };
  }

  private startNextQueuedTask(queue: QueueEntry): void {
    const nextTask = queue.taskIds
      .map((taskId) => this.tasks.get(taskId))
      .filter((task): task is DelegatedTask => task !== undefined)
      .find((task) => task.status === 'queued');
    if (!nextTask) {
      if (queue.taskIds.length === 0) {
        this.queues.delete(queue.key);
      }
      return;
    }

    nextTask.status = 'running';
    nextTask.startedAt = new Date().toISOString();
    this.startTask(nextTask);
  }

  private startTask(task: DelegatedTask): void {
    this.eventBus.emit('task:started', {
      taskId: task.taskId,
      appSlug: task.appSlug,
    });
    const executor = this.executors[task.target];
    void executor(task).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emitFailure({ taskId: task.taskId, appSlug: task.appSlug, error: message });
    });
  }

  private emitFailure(event: TaskFailedEvent): void {
    this.eventBus.emit('task:failed', event);
  }

  private getOrCreateQueue(key: string): QueueEntry {
    const existing = this.queues.get(key);
    if (existing) {
      return existing;
    }
    const created: QueueEntry = { key, taskIds: [] };
    this.queues.set(key, created);
    return created;
  }
}

export function queueKey(appSlug: string, target: DelegatedTaskTarget): string {
  return `${appSlug}:${target}`;
}
