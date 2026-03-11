import { describe, expect, test } from 'bun:test';
import { EventBus } from '../../src/core/event-bus';
import { TaskRegistry } from '../../src/ai/cozybase/task-registry';

describe('TaskRegistry', () => {
  test('emits task:started for running tasks and starts the next queued task after completion', async () => {
    const eventBus = new EventBus();
    const started: string[] = [];
    const executed: string[] = [];

    eventBus.on('task:started', (event) => {
      started.push(event.taskId);
    });

    const registry = new TaskRegistry(eventBus, {
      builder: async (task) => {
        executed.push(task.taskId);
      },
      operator: async () => {},
    });

    const first = registry.enqueue({
      appSlug: 'orders',
      type: 'create',
      target: 'builder',
      instruction: 'first',
    });
    const second = registry.enqueue({
      appSlug: 'orders',
      type: 'develop',
      target: 'builder',
      instruction: 'second',
    });

    await Bun.sleep(0);
    expect(first.status).toBe('running');
    expect(second.status).toBe('queued');
    expect(started).toEqual([first.taskId]);
    expect(executed).toEqual([first.taskId]);

    eventBus.emit('task:completed', {
      taskId: first.taskId,
      appSlug: 'orders',
      summary: 'done',
    });

    await Bun.sleep(0);
    expect(registry.getTask(first.taskId)?.status).toBe('completed');
    expect(registry.getTask(second.taskId)?.status).toBe('running');
    expect(started).toEqual([first.taskId, second.taskId]);
    expect(executed).toEqual([first.taskId, second.taskId]);
  });
});
