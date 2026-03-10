import { afterEach, describe, expect, test } from 'bun:test';
import { RuntimeSessionStore } from '../../src/ai/runtime-session-store';
import { createTestWorkspace, type TestWorkspaceHandle } from '../helpers/test-workspace';

describe('RuntimeSessionStore', () => {
  let handle: TestWorkspaceHandle;

  afterEach(() => {
    handle?.cleanup();
  });

  test('persists the singleton cozybase session without requiring an app row', () => {
    handle = createTestWorkspace();
    const store = new RuntimeSessionStore(handle.workspace.getPlatformDb());

    store.saveSession('cozybase', '__cozybase__', 'codex', {
      providerKind: 'codex',
      version: 1,
      state: {
        resumeSessionId: 'thread-cozybase-1',
        history: [{ role: 'assistant', content: 'hello' }],
      },
    });

    expect(store.getSession('cozybase', '__cozybase__')).toEqual({
      providerKind: 'codex',
      snapshot: {
        providerKind: 'codex',
        version: 1,
        state: {
          resumeSessionId: 'thread-cozybase-1',
          history: [{ role: 'assistant', content: 'hello' }],
        },
      },
    });
  });
});
