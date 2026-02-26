import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { dispatchAction } from '../action';
import type { ActionSchema } from '../../schema/types';

// ---- Helpers ----

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: 'http://localhost:3000',
    expressionContext: {},
    triggerReload: mock(() => {}),
    openDialog: mock(() => {}),
    closeDialog: mock(() => {}),
    navigate: mock(() => {}),
    ...overrides,
  };
}

function mockFetchOk(data: unknown = {}) {
  return mock(() =>
    Promise.resolve(new Response(JSON.stringify(data), { status: 200 })),
  ) as typeof globalThis.fetch;
}

function mockFetchError(status: number, data: unknown = {}) {
  return mock(() =>
    Promise.resolve(new Response(JSON.stringify(data), { status })),
  ) as typeof globalThis.fetch;
}

// ---- Setup / Teardown ----

let originalFetch: typeof globalThis.fetch;
let originalWindow: typeof globalThis.window;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalWindow = globalThis.window;

  // Ensure globalThis.window exists (Bun runs in a server-like env without window)
  if (typeof globalThis.window === 'undefined') {
    (globalThis as any).window = {} as any;
  }
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  // Restore original window (or remove if it did not exist)
  if (originalWindow === undefined) {
    delete (globalThis as any).window;
  } else {
    globalThis.window = originalWindow;
  }
});

// ---- Tests ----

describe('dispatchAction', () => {
  // ---- API action ----

  describe('api action', () => {
    test('auto-prefixes relative URL with baseUrl', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock;

      const ctx = makeCtx();
      await dispatchAction(
        { type: 'api', method: 'GET', url: '/db/todo' } as ActionSchema,
        ctx,
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('http://localhost:3000/db/todo');
    });

    test('does not prefix absolute URL', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock;

      const ctx = makeCtx();
      await dispatchAction(
        {
          type: 'api',
          method: 'GET',
          url: 'https://external.com/api',
        } as ActionSchema,
        ctx,
      );

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('https://external.com/api');
    });

    test('sends JSON body when body is provided', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock;

      const ctx = makeCtx();
      await dispatchAction(
        {
          type: 'api',
          method: 'POST',
          url: '/db/todo',
          body: { title: 'New Todo' },
        } as ActionSchema,
        ctx,
      );

      const calledOptions = fetchMock.mock.calls[0][1] as RequestInit;
      expect(calledOptions.method).toBe('POST');
      expect(calledOptions.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(calledOptions.body).toBe(JSON.stringify({ title: 'New Todo' }));
    });

    test('calls onSuccess chain after successful fetch', async () => {
      const responseData = { id: 1 };
      globalThis.fetch = mockFetchOk(responseData);

      const triggerReload = mock(() => {});
      const ctx = makeCtx({ triggerReload });

      await dispatchAction(
        {
          type: 'api',
          method: 'POST',
          url: '/db/todo',
          onSuccess: { type: 'reload', target: 'todoTable' },
        } as ActionSchema,
        ctx,
      );

      expect(triggerReload).toHaveBeenCalledWith('todoTable');
    });

    test('calls onError chain after failed fetch', async () => {
      globalThis.fetch = mockFetchError(500, { error: 'Server Error' });

      const closeDialog = mock(() => {});
      const ctx = makeCtx({ closeDialog });

      await dispatchAction(
        {
          type: 'api',
          method: 'POST',
          url: '/db/todo',
          onError: { type: 'close' },
        } as ActionSchema,
        ctx,
      );

      expect(closeDialog).toHaveBeenCalledTimes(1);
    });

    test('resolves expressions in URL', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock;

      const ctx = makeCtx({
        expressionContext: { row: { id: 42 } },
      });

      await dispatchAction(
        {
          type: 'api',
          method: 'DELETE',
          url: '/db/todo/${row.id}',
        } as ActionSchema,
        ctx,
      );

      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('http://localhost:3000/db/todo/42');
    });

    test('resolves expressions in body', async () => {
      const fetchMock = mockFetchOk();
      globalThis.fetch = fetchMock;

      const ctx = makeCtx({
        expressionContext: { row: { id: 10, title: 'Updated' } },
      });

      await dispatchAction(
        {
          type: 'api',
          method: 'PUT',
          url: '/db/todo/${row.id}',
          body: { title: '${row.title}' },
        } as ActionSchema,
        ctx,
      );

      const calledOptions = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(calledOptions.body as string)).toEqual({
        title: 'Updated',
      });
    });
  });

  // ---- Reload action ----

  describe('reload action', () => {
    test('calls triggerReload with the specified target', async () => {
      const triggerReload = mock(() => {});
      const ctx = makeCtx({ triggerReload });

      await dispatchAction(
        { type: 'reload', target: 'todoTable' } as ActionSchema,
        ctx,
      );

      expect(triggerReload).toHaveBeenCalledWith('todoTable');
    });
  });

  // ---- Close action ----

  describe('close action', () => {
    test('calls closeDialog', async () => {
      const closeDialog = mock(() => {});
      const ctx = makeCtx({ closeDialog });

      await dispatchAction({ type: 'close' } as ActionSchema, ctx);

      expect(closeDialog).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Dialog action ----

  describe('dialog action', () => {
    test('calls openDialog with correct parameters', async () => {
      const openDialog = mock(() => {});
      const ctx = makeCtx({ openDialog });

      const body = { type: 'text', text: 'Hello' } as any;
      await dispatchAction(
        {
          type: 'dialog',
          title: 'My Dialog',
          body,
          width: 600,
        } as ActionSchema,
        ctx,
      );

      expect(openDialog).toHaveBeenCalledTimes(1);
      const arg = openDialog.mock.calls[0][0] as any;
      expect(arg.title).toBe('My Dialog');
      expect(arg.body).toBe(body);
      expect(arg.width).toBe(600);
      expect(arg.id).toMatch(/^dialog-\d+$/);
    });

    test('resolves expressions in dialog title', async () => {
      const openDialog = mock(() => {});
      const ctx = makeCtx({
        openDialog,
        expressionContext: { row: { name: 'Item A' } },
      });

      await dispatchAction(
        {
          type: 'dialog',
          title: 'Edit ${row.name}',
          body: { type: 'text', text: 'content' },
        } as ActionSchema,
        ctx,
      );

      const arg = openDialog.mock.calls[0][0] as any;
      expect(arg.title).toBe('Edit Item A');
    });
  });

  // ---- Confirm action ----

  describe('confirm action', () => {
    test('executes onConfirm when user confirms', async () => {
      (globalThis as any).window.confirm = mock(() => true);

      const triggerReload = mock(() => {});
      const ctx = makeCtx({ triggerReload });

      await dispatchAction(
        {
          type: 'confirm',
          message: 'Are you sure?',
          onConfirm: { type: 'reload', target: 'table' },
        } as ActionSchema,
        ctx,
      );

      expect((globalThis as any).window.confirm).toHaveBeenCalledWith(
        'Are you sure?',
      );
      expect(triggerReload).toHaveBeenCalledWith('table');
    });

    test('executes onCancel when user cancels', async () => {
      (globalThis as any).window.confirm = mock(() => false);

      const closeDialog = mock(() => {});
      const ctx = makeCtx({ closeDialog });

      await dispatchAction(
        {
          type: 'confirm',
          message: 'Delete?',
          onConfirm: { type: 'reload', target: 'table' },
          onCancel: { type: 'close' },
        } as ActionSchema,
        ctx,
      );

      expect(closeDialog).toHaveBeenCalledTimes(1);
    });

    test('does nothing extra when user cancels and no onCancel provided', async () => {
      (globalThis as any).window.confirm = mock(() => false);

      const triggerReload = mock(() => {});
      const ctx = makeCtx({ triggerReload });

      await dispatchAction(
        {
          type: 'confirm',
          message: 'Delete?',
          onConfirm: { type: 'reload', target: 'table' },
        } as ActionSchema,
        ctx,
      );

      expect(triggerReload).not.toHaveBeenCalled();
    });

    test('resolves expressions in confirm message', async () => {
      (globalThis as any).window.confirm = mock(() => false);

      const ctx = makeCtx({
        expressionContext: { row: { name: 'Item X' } },
      });

      await dispatchAction(
        {
          type: 'confirm',
          message: 'Delete ${row.name}?',
          onConfirm: { type: 'reload', target: 'table' },
        } as ActionSchema,
        ctx,
      );

      expect((globalThis as any).window.confirm).toHaveBeenCalledWith(
        'Delete Item X?',
      );
    });
  });

  // ---- Action array ----

  describe('action array', () => {
    test('executes multiple actions in sequence', async () => {
      globalThis.fetch = mockFetchOk();

      const triggerReload = mock(() => {});
      const closeDialog = mock(() => {});
      const ctx = makeCtx({ triggerReload, closeDialog });

      await dispatchAction(
        [
          { type: 'api', method: 'POST', url: '/db/todo' },
          { type: 'reload', target: 'table' },
          { type: 'close' },
        ] as ActionSchema[],
        ctx,
      );

      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(triggerReload).toHaveBeenCalledWith('table');
      expect(closeDialog).toHaveBeenCalledTimes(1);
    });
  });

  // ---- Link action ----

  describe('link action', () => {
    test('calls navigate when navigate function is provided', async () => {
      const navigate = mock(() => {});
      const ctx = makeCtx({ navigate });

      await dispatchAction(
        { type: 'link', url: '/settings' } as ActionSchema,
        ctx,
      );

      expect(navigate).toHaveBeenCalledWith('/settings');
    });

    test('resolves expressions in link URL', async () => {
      const navigate = mock(() => {});
      const ctx = makeCtx({
        navigate,
        expressionContext: { row: { id: 5 } },
      });

      await dispatchAction(
        { type: 'link', url: '/items/${row.id}' } as ActionSchema,
        ctx,
      );

      expect(navigate).toHaveBeenCalledWith('/items/5');
    });
  });
});
