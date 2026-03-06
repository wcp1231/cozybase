import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { resolveContentSlotState, toAppPagePath } from './content-slot';

const pagesJson: PagesJson = {
  pages: [
    { path: 'todo-list', title: 'Todo', body: [] },
    { path: 'settings', title: 'Settings', body: [] },
  ],
};

describe('content slot navigation flow', () => {
  test('list -> app -> first page redirect flow is continuous', () => {
    const appPath = toAppPagePath('welcome', undefined, 'draft');
    expect(appPath).toBe('/draft/apps/welcome');

    const result = resolveContentSlotState({
      appName: 'welcome',
      subPath: undefined,
      mode: 'draft',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('redirect');
    if (result.type === 'redirect') {
      expect(result.to).toBe('/draft/apps/welcome/todo-list');
    }
  });

  test('page switching keeps rendering in slot', () => {
    const first = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'todo-list',
      mode: 'stable',
      pagesJson,
      appLoading: false,
      appError: null,
    });
    expect(first.type).toBe('render');

    const second = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'settings',
      mode: 'draft',
      pagesJson,
      appLoading: false,
      appError: null,
    });
    expect(second.type).toBe('render');
  });

  test('missing page shows error state without crashing shell', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'missing',
      mode: 'stable',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('not-found');
  });
});
