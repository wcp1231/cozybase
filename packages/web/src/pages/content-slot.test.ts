import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { resolveContentSlotState } from './content-slot';

const pagesJson: PagesJson = {
  pages: [
    { id: 'todo-list', title: 'Todo', body: [] },
    { id: 'settings', title: 'Settings', body: [] },
  ],
};

describe('resolveContentSlotState', () => {
  test('returns loading while app data is being fetched', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'todo-list',
      mode: 'stable',
      pagesJson,
      appLoading: true,
      appError: null,
    });

    expect(result.type).toBe('loading');
  });

  test('returns error when app loading fails', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'todo-list',
      mode: 'stable',
      pagesJson,
      appLoading: false,
      appError: 'boom',
    });

    expect(result.type).toBe('error');
    if (result.type === 'error') {
      expect(result.message).toBe('boom');
    }
  });

  test('returns no-ui when pages are missing', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'todo-list',
      mode: 'stable',
      pagesJson: null,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('no-ui');
  });

  test('redirects to first page when pageId is absent', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: undefined,
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

  test('returns not-found when pageId does not exist', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'missing',
      mode: 'stable',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('not-found');
  });

  test('returns render state with page and baseUrl', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      pageId: 'settings',
      mode: 'draft',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('render');
    if (result.type === 'render') {
      expect(result.page.id).toBe('settings');
      expect(result.baseUrl).toBe('/draft/apps/welcome');
    }
  });
});
