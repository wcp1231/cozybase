import { describe, expect, test } from 'bun:test';
import { LifecycleStore } from '../../src/ai/cozybase/lifecycle-store';

describe('LifecycleStore', () => {
  test('creates a single active lifecycle and tracks task ownership', () => {
    const store = new LifecycleStore();
    const first = store.ensureActiveLifecycle();
    const second = store.ensureActiveLifecycle();

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.lifecycle.lifecycleId).toBe(first.lifecycle.lifecycleId);

    store.addWaiter(first.lifecycle.lifecycleId, {
      waiterId: 'waiter-1',
      source: 'acp',
    });
    store.enqueueEvent(first.lifecycle.lifecycleId, {
      kind: 'user_message',
      text: 'build app',
      createdAt: new Date().toISOString(),
    });
    store.registerTask(first.lifecycle.lifecycleId, 'task-1');

    const lifecycle = store.getLifecycle(first.lifecycle.lifecycleId);
    expect(lifecycle?.waiters).toHaveLength(1);
    expect(lifecycle?.events).toHaveLength(1);
    expect(lifecycle?.pendingTaskIds).toEqual(['task-1']);
    expect(store.getLifecycleForTask('task-1')?.lifecycleId).toBe(first.lifecycle.lifecycleId);
  });

  test('only completes after inbox, conversation, and pending tasks are drained', () => {
    const store = new LifecycleStore();
    const { lifecycle } = store.ensureActiveLifecycle();

    store.enqueueEvent(lifecycle.lifecycleId, {
      kind: 'user_message',
      text: 'hello',
      createdAt: new Date().toISOString(),
    });
    expect(store.canComplete(lifecycle.lifecycleId)).toBe(false);

    store.shiftEvent(lifecycle.lifecycleId);
    store.startConversation(lifecycle.lifecycleId, 'conversation-1');
    expect(store.canComplete(lifecycle.lifecycleId)).toBe(false);

    store.registerTask(lifecycle.lifecycleId, 'task-1');
    store.finishConversation(lifecycle.lifecycleId);
    expect(store.canComplete(lifecycle.lifecycleId)).toBe(false);

    store.markTaskTerminal('task-1');
    expect(store.canComplete(lifecycle.lifecycleId)).toBe(true);

    const completed = store.completeLifecycle(lifecycle.lifecycleId);
    expect(completed?.status).toBe('completed');
    expect(store.getActiveLifecycle()).toBeNull();
  });

  test('marks lifecycle failed and clears the active lifecycle pointer', () => {
    const store = new LifecycleStore();
    const { lifecycle } = store.ensureActiveLifecycle();

    const failed = store.failLifecycle(lifecycle.lifecycleId, 'provider failed');

    expect(failed?.status).toBe('failed');
    expect(failed?.failureMessage).toBe('provider failed');
    expect(store.getActiveLifecycle()).toBeNull();
  });
});
