import { describe, test, expect, mock, beforeAll, beforeEach, afterEach } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

// Register all built-in components (side-effect import)
import '../../components';

import { SchemaRenderer } from '../../renderer';
import type {
  PageSchema,
  CardComponent,
  ButtonComponent,
  LinkComponent,
  ListComponent,
} from '../../schema/types';

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
) {
  await act(async () => {
    root.render(createElement(SchemaRenderer, { schema, baseUrl }));
  });
}

// ---- Tests ----

describe('CardRenderer', () => {
  test('card without action renders as non-clickable container', async () => {
    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'card',
          title: 'Simple Card',
          children: [
            { type: 'text', text: 'Hello' },
          ],
        } as unknown as CardComponent,
      ],
    };

    await renderPage(schema);

    const card = container.querySelector('div > div') as HTMLDivElement;
    expect(card).not.toBeNull();
    expect(card!.className).not.toContain('cursor-pointer');
  });

  test('card with action triggers dispatchAction on click', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'card',
          title: 'Clickable Card',
          children: [
            { type: 'text', text: 'Click me' },
          ],
          action: {
            type: 'api',
            method: 'POST',
            url: '/fn/track-click',
          },
        } as unknown as CardComponent,
      ],
    };

    await renderPage(schema);

    // Find the card element (outermost div with cursor-pointer)
    const card = container.querySelector('.cursor-pointer') as HTMLDivElement;
    expect(card).not.toBeNull();

    await act(async () => {
      card!.click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3000/fn/track-click');
  });

  test('card with action has cursor-pointer class', async () => {
    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'card',
          title: 'Styled Card',
          children: [
            { type: 'text', text: 'Styled' },
          ],
          action: {
            type: 'api',
            method: 'POST',
            url: '/fn/noop',
          },
        } as unknown as CardComponent,
      ],
    };

    await renderPage(schema);

    const card = container.querySelector('.cursor-pointer') as HTMLDivElement;
    expect(card).not.toBeNull();
    expect(card!.className).toContain('cursor-pointer');
    expect(card!.className).toContain('transition-shadow');
  });

  test('clicking button inside clickable card does not trigger card action', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'card',
          title: 'Card with Button',
          children: [
            { type: 'text', text: 'Some content' },
            {
              type: 'button',
              label: 'Inner Button',
              action: {
                type: 'api',
                method: 'POST',
                url: '/fn/button-action',
              },
            } as unknown as ButtonComponent,
          ],
          action: {
            type: 'api',
            method: 'POST',
            url: '/fn/card-action',
          },
        } as unknown as CardComponent,
      ],
    };

    await renderPage(schema);

    // Click the button, not the card
    const button = container.querySelector('button') as HTMLButtonElement;
    expect(button).not.toBeNull();

    await act(async () => {
      button!.click();
    });

    // Button action should fire, but card action should NOT
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3000/fn/button-action');
  });

  test('clicking link inside clickable card does not trigger card action', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'card',
          title: 'Card with Link',
          children: [
            { type: 'text', text: 'Some content' },
            {
              type: 'link',
              text: 'Inner Link',
              action: {
                type: 'api',
                method: 'POST',
                url: '/fn/link-action',
              },
            } as unknown as LinkComponent,
          ],
          action: {
            type: 'api',
            method: 'POST',
            url: '/fn/card-action',
          },
        } as unknown as CardComponent,
      ],
    };

    await renderPage(schema);

    const link = container.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();

    await act(async () => {
      link!.click();
    });

    // Link action should fire, but card action should NOT
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe('http://localhost:3000/fn/link-action');
  });

  test('card title resolves row-scoped expressions inside list items', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ id: 1, name: 'Peanut' }],
          }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'list',
          api: {
            url: '/fn/allergies',
          },
          itemRender: {
            type: 'card',
            title: 'Allergy: ${row.name}',
            children: [{ type: 'text', text: 'row content' }],
          } as unknown as CardComponent,
        } as unknown as ListComponent,
      ],
    };

    await renderPage(schema);

    const cardTitle = container.querySelector(
      '[data-schema-type="card"] .font-semibold',
    ) as HTMLDivElement | null;
    expect(cardTitle).not.toBeNull();
    expect(cardTitle?.textContent).toBe('Allergy: Peanut');
  });

  test('card style resolves row-scoped expressions inside list items', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            data: [{ id: 1, name: 'Peanut', status: 'allergic' }],
          }),
          { status: 200 },
        ),
      ),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'list',
          api: {
            url: '/fn/allergies',
          },
          itemRender: {
            type: 'card',
            style: {
              backgroundColor:
                "${row.status === 'allergic' ? '#ff4d4f' : row.status === 'not_allergic' ? '#52c41a' : '#ffffff'}",
            },
            children: [{ type: 'text', text: '${row.name}' }],
          } as unknown as CardComponent,
        } as unknown as ListComponent,
      ],
    };

    await renderPage(schema);

    const cardWrapper = container.querySelector('[data-schema-type="card"]') as HTMLDivElement;
    const card = cardWrapper?.firstElementChild as HTMLDivElement | null;

    expect(card).not.toBeNull();
    expect(card!.style.backgroundColor).toBe('#ff4d4f');
  });
});
