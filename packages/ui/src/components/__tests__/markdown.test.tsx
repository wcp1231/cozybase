import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'bun:test';
import { GlobalWindow } from 'happy-dom';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';

import '../../components';

import { SchemaRenderer } from '../../renderer';
import type { MarkdownComponent, PageSchema } from '../../schema/types';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const win = new GlobalWindow({ url: 'http://localhost' });

beforeAll(() => {
  const keys = [
    'document', 'HTMLElement', 'Element', 'Node', 'Text', 'DocumentFragment',
    'MutationObserver', 'navigator', 'Event', 'CustomEvent', 'MouseEvent',
    'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame',
    'cancelAnimationFrame', 'HTMLAnchorElement', 'HTMLDivElement', 'SyntaxError',
    'DOMException',
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

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderPage(
  schema: PageSchema,
  params?: Record<string, string>,
) {
  await act(async () => {
    root.render(createElement(SchemaRenderer, {
      schema,
      baseUrl: 'http://localhost:3000',
      params,
    }));
  });
}

describe('MarkdownRenderer', () => {
  test('renders GFM content from expressions', async () => {
    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'markdown',
          id: 'doc-body',
          content: '${params.body}',
        } as unknown as MarkdownComponent,
      ],
    };

    await renderPage(schema, {
      body: '## Release Notes\n\n- Added table support\n\n| Name | Value |\n| --- | --- |\n| A | 1 |\n\n`inline`',
    });

    expect(container.querySelector('h2')?.textContent).toBe('Release Notes');
    expect(container.querySelectorAll('li')).toHaveLength(1);
    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelector('code')?.textContent).toBe('inline');
  });

  test('adds safe link attributes for markdown links', async () => {
    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'markdown',
          id: 'doc-link',
          content: '[Open docs](https://example.com/docs)',
        } as unknown as MarkdownComponent,
      ],
    };

    await renderPage(schema);

    const link = container.querySelector('a') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://example.com/docs');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noreferrer noopener');
  });

  test('does not render raw html blocks as live DOM nodes', async () => {
    const schema: PageSchema = {
      path: 'test',
      title: 'Test',
      body: [
        {
          type: 'markdown',
          id: 'doc-safe',
          content: '<script>alert(1)</script>\n\n<b>bold</b>',
        } as unknown as MarkdownComponent,
      ],
    };

    await renderPage(schema);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('<b>bold</b>');
  });
});
