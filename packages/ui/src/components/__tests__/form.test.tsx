import { describe, test, expect, mock, beforeAll, beforeEach, afterEach } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Register all built-in components (side-effect import)
import '../../components';

import { SchemaRenderer } from '../../renderer';
import type { PageSchema, FormComponent, ListComponent, TableComponent } from '../../schema/types';

// Enable React act() environment
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// ---- DOM setup via happy-dom GlobalWindow ----

const win = new GlobalWindow({ url: 'http://localhost' });

beforeAll(() => {
  const keys = [
    'document', 'HTMLElement', 'Element', 'Node', 'Text', 'DocumentFragment',
    'MutationObserver', 'navigator', 'Event', 'CustomEvent', 'MouseEvent',
    'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame', 'HTMLInputElement', 'HTMLFormElement',
    'HTMLButtonElement', 'HTMLDivElement', 'SyntaxError', 'DOMException',
  ];
  for (const key of keys) {
    if ((win as any)[key] !== undefined) {
      (globalThis as any)[key] = (win as any)[key];
    }
  }
  (globalThis as any).window = win;
});

let container: HTMLDivElement;
let root: Root;
let origFetch: typeof globalThis.fetch;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  origFetch = globalThis.fetch;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  globalThis.fetch = origFetch;
});

// ---- Helpers ----

async function renderPage(
  schema: PageSchema,
  baseUrl = 'http://localhost:3000',
  params?: Record<string, string>,
) {
  await act(async () => {
    root.render(createElement(SchemaRenderer, { schema, baseUrl, params }));
  });
}

// ---- Tests ----

describe('FormRenderer', () => {
  describe('defaultValue expression resolution', () => {
    test('static defaultValue populates the input field', async () => {
      const schema: PageSchema = {
        id: 'test',
        title: 'Test',
        body: [
          {
            type: 'form',
            fields: [
              {
                name: 'title',
                label: 'Title',
                type: 'input',
                defaultValue: 'Hello World',
              },
            ],
          } as FormComponent,
        ],
      };

      await renderPage(schema);

      const input = container.querySelector('input') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      expect(input!.value).toBe('Hello World');
    });

    test('expression defaultValue without row context resolves to empty', async () => {
      const schema: PageSchema = {
        id: 'test',
        title: 'Test',
        body: [
          {
            type: 'form',
            fields: [
              {
                name: 'title',
                label: 'Title',
                type: 'input',
                defaultValue: '${row.title}',
              },
            ],
          } as FormComponent,
        ],
      };

      await renderPage(schema);

      const input = container.querySelector('input') as HTMLInputElement | null;
      expect(input).not.toBeNull();
      // Without row context, ${row.title} resolves to undefined → shown as empty
      expect(input!.value).toBe('');
    });
  });

  describe('form api.url expression resolution', () => {
    test('submits to the correct URL with form body', async () => {
      const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
      );
      globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

      const schema: PageSchema = {
        id: 'test',
        title: 'Test',
        body: [
          {
            type: 'form',
            fields: [
              {
                name: 'title',
                label: 'Title',
                type: 'input',
                defaultValue: 'Some title',
                required: true,
              },
            ],
            api: {
              method: 'POST',
              url: '/fn/todos',
            },
          } as FormComponent,
        ],
      };

      await renderPage(schema);

      const submitBtn = container.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      expect(submitBtn).not.toBeNull();

      await act(async () => {
        submitBtn!.click();
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const calledUrl = fetchMock.mock.calls[0][0];
      expect(calledUrl).toBe('http://localhost:3000/fn/todos');

      const calledOptions = fetchMock.mock.calls[0][1] as RequestInit;
      expect(JSON.parse(calledOptions.body as string)).toEqual({ title: 'Some title' });
    });
  });
});

describe('params expression resolution', () => {
  test('list component resolves ${params.xxx} in api.params when params are provided', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 1, name: 'Baby' }] }), { status: 200 }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      id: 'test',
      title: 'Test',
      body: [
        {
          type: 'list',
          api: {
            url: '/fn/_db/tables/babies',
            params: {
              where: 'id.eq.${params.baby_id}',
            },
          },
          itemRender: {
            type: 'text',
            text: '${row.name}',
          },
        } as ListComponent,
      ],
    };

    await renderPage(schema, 'http://localhost:3000', { baby_id: '42' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    // The resolved URL should contain the param value, not the raw expression
    expect(calledUrl).toContain('where=id.eq.42');
    expect(calledUrl).not.toContain('${params.baby_id}');
  });

  test('list component resolves ${params.xxx} to empty when params not provided', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [] }), { status: 200 }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      id: 'test',
      title: 'Test',
      body: [
        {
          type: 'list',
          api: {
            url: '/fn/_db/tables/babies',
            params: {
              where: 'id.eq.${params.baby_id}',
            },
          },
          itemRender: {
            type: 'text',
            text: '${row.name}',
          },
        } as ListComponent,
      ],
    };

    // No params passed — ${params.baby_id} should resolve to empty
    await renderPage(schema);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    // Without params, the expression resolves to empty, and useApiData skips empty values
    expect(calledUrl).not.toContain('${params.baby_id}');
  });

  test('table component resolves ${params.xxx} in api.params when params are provided', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(JSON.stringify({ data: [{ id: 1, name: 'Item' }] }), { status: 200 }),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      id: 'test',
      title: 'Test',
      body: [
        {
          type: 'table',
          api: {
            url: '/fn/_db/tables/items',
            params: {
              where: 'parent_id.eq.${params.parent_id}',
            },
          },
          columns: [
            { name: 'name', label: 'Name' },
          ],
          pagination: false,
        } as TableComponent,
      ],
    };

    await renderPage(schema, 'http://localhost:3000', { parent_id: '99' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('where=parent_id.eq.99');
    expect(calledUrl).not.toContain('${params.parent_id}');
  });

  test('form defaultValue resolves ${params.xxx} when params are provided', async () => {
    const schema: PageSchema = {
      id: 'test',
      title: 'Test',
      body: [
        {
          type: 'form',
          fields: [
            {
              name: 'baby_id',
              label: 'Baby ID',
              type: 'input',
              defaultValue: '${params.baby_id}',
            },
          ],
        } as FormComponent,
      ],
    };

    await renderPage(schema, 'http://localhost:3000', { baby_id: '42' });

    const input = container.querySelector('input') as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input!.value).toBe('42');
  });
});
