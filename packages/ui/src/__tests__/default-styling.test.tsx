import { afterEach, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import '../components';

import { applyBuiltinSchemaDefaults, mergeSchemaClassName, mergeSchemaStyle } from '../default-styling';
import { SchemaRenderer } from '../renderer';
import type {
  ButtonComponent,
  CardComponent,
  FormComponent,
  HeadingComponent,
  PageSchema,
  RowComponent,
  TableComponent,
  TextComponent,
} from '../schema/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

async function renderPage(schema: PageSchema) {
  await act(async () => {
    root.render(createElement(SchemaRenderer, { schema, baseUrl: 'http://localhost:3000' }));
  });
}

describe('default styling helpers', () => {
  test('merges styles shallowly and appends class names', () => {
    expect(
      mergeSchemaStyle(
        { padding: 24, backgroundColor: 'var(--cz-bg)' },
        { padding: 0, color: 'var(--cz-text)' },
      ),
    ).toEqual({
      padding: 0,
      backgroundColor: 'var(--cz-bg)',
      color: 'var(--cz-text)',
    });

    expect(mergeSchemaClassName('overflow-hidden', 'custom-table')).toBe(
      'overflow-hidden custom-table',
    );
  });

  test('applies scalar defaults only when fields are undefined', () => {
    const rowWithoutGap = applyBuiltinSchemaDefaults({
      type: 'row',
      id: 'row-default',
      children: [],
    } as unknown as RowComponent);
    expect(rowWithoutGap.gap).toBe(12);

    const rowWithExplicitGap = applyBuiltinSchemaDefaults({
      type: 'row',
      id: 'row-explicit',
      gap: 0,
      children: [],
    } as unknown as RowComponent);
    expect(rowWithExplicitGap.gap).toBe(0);

    const card = applyBuiltinSchemaDefaults({
      type: 'card',
      id: 'card-default',
      children: [],
      padding: 0,
    } as unknown as CardComponent);
    expect(card.padding).toBe(0);
  });

  test('uses theme-token-aware defaults for styled components', () => {
    const heading = applyBuiltinSchemaDefaults({
      type: 'heading',
      id: 'heading-default',
      text: 'Overview',
      level: 2,
    } as unknown as HeadingComponent);
    expect(heading.style).toEqual(expect.objectContaining({
      color: 'var(--cz-text)',
      fontSize: 30,
    }));

    const text = applyBuiltinSchemaDefaults({
      type: 'text',
      id: 'text-default',
      text: 'Summary',
    } as unknown as TextComponent);
    expect(text.style).toEqual(expect.objectContaining({
      color: 'var(--cz-text-secondary)',
      lineHeight: 1.6,
    }));

    const table = applyBuiltinSchemaDefaults({
      type: 'table',
      id: 'table-default',
      api: { url: '/fn/items' },
      columns: [],
    } as unknown as TableComponent);
    expect(table.className).toBe('overflow-hidden');
    expect(table.style).toEqual(expect.objectContaining({
      border: '1px solid var(--cz-border)',
      boxShadow: 'var(--cz-shadow-sm)',
      overflowX: 'auto',
    }));
  });
});

describe('SchemaRenderer default styling', () => {
  test('renders default visual baseline without mutating the input schema', async () => {
    const schema: PageSchema = {
      path: 'home',
      title: 'Home',
      body: [
        {
          type: 'heading',
          id: 'heading-overview',
          text: 'Overview',
          level: 2,
        } as unknown as HeadingComponent,
        {
          type: 'text',
          id: 'text-summary',
          text: 'A generated summary',
        } as unknown as TextComponent,
        {
          type: 'form',
          id: 'form-filters',
          fields: [
            { name: 'query', label: 'Query', type: 'input', placeholder: 'Search...' },
          ],
        } as unknown as FormComponent,
        {
          type: 'button',
          id: 'btn-submit',
          label: 'Apply',
          action: { type: 'close' },
        } as unknown as ButtonComponent,
      ],
    };

    await renderPage(schema);

    expect((schema.body[0] as Record<string, unknown>).style).toBeUndefined();
    expect((schema.body[1] as Record<string, unknown>).style).toBeUndefined();
    expect((schema.body[2] as Record<string, unknown>).style).toBeUndefined();

    const heading = container.querySelector('h2');
    expect(heading?.getAttribute('style')).toContain('font-size: 30px');
    expect(heading?.getAttribute('style')).toContain('color: var(--cz-text)');

    const text = container.querySelector('span');
    expect(text?.getAttribute('style')).toContain('color: var(--cz-text-secondary)');

    const form = container.querySelector('form');
    expect(form?.getAttribute('style')).toContain('padding: 16px');
    expect(form?.getAttribute('style')).toContain('border-radius: var(--cz-radius-md)');
    expect(form?.getAttribute('style')).toContain('background-color: var(--cz-bg-subtle)');

    const input = container.querySelector('input');
    expect(input?.className).toContain('shadow-sm');
    expect(input?.className).toContain('focus-visible:ring-2');

    const button = container.querySelector('button[type="button"]');
    expect(button?.className).toContain('shadow-sm');
    expect(button?.className).toContain('focus-visible:ring-2');
  });

  test('keeps explicit root-level style overrides when applying defaults', async () => {
    const fetchMock = mock((_input: RequestInfo | URL, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;

    const schema: PageSchema = {
      path: 'home',
      title: 'Home',
      body: [
        {
          type: 'table',
          id: 'table-orders',
          api: { url: '/fn/orders' },
          columns: [],
          style: {
            boxShadow: 'none',
          },
          className: 'custom-table',
        } as unknown as TableComponent,
      ],
    };

    await renderPage(schema);

    const tableWrapper = container.querySelector('.custom-table') as HTMLDivElement | null;
    expect(tableWrapper).not.toBeNull();
    expect(tableWrapper?.className).toContain('overflow-hidden');
    expect(tableWrapper?.getAttribute('style')).toContain('box-shadow: none');
    expect(tableWrapper?.getAttribute('style')).toContain('overflow-x: auto');
    expect(tableWrapper?.getAttribute('style')).toContain('border-radius: var(--cz-radius-md)');
  });
});
