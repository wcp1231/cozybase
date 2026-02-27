import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { resolveContentSlotState, toAppPagePath } from './content-slot';

const pagesJson: PagesJson = {
  pages: [
    { id: 'todo-list', title: 'Todo', body: [] },
    { id: 'settings', title: 'Settings', body: [] },
  ],
};

describe('content slot navigation flow', () => {
  test('list -> app -> first page redirect flow is continuous', () => {
    const appPath = toAppPagePath('welcome');
    expect(appPath).toBe('/apps/welcome');

    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: undefined,
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('redirect');
    if (result.type === 'redirect') {
      expect(result.to).toBe('/apps/welcome/todo-list');
    }
  });

  test('page switching keeps rendering in slot', () => {
    const first = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'todo-list',
      pagesJson,
      appLoading: false,
      appError: null,
    });
    expect(first.type).toBe('render');

    const second = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'settings',
      pagesJson,
      appLoading: false,
      appError: null,
    });
    expect(second.type).toBe('render');
  });

  test('missing page shows error state without crashing shell', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'missing',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('not-found');
  });
});
