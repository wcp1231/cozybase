import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { resolveContentSlotState } from './content-slot';

const pagesJson: PagesJson = {
  pages: [
    { path: 'orders', title: '订单列表', body: [] },
    { path: 'orders/new', title: '新建订单', body: [] },
    { path: 'orders/:orderId', title: '订单 #${params.orderId}', body: [] },
    { path: 'orders/:orderId/refund', title: '退款', body: [] },
    { path: 'orders/:orderId/logs', title: '日志', body: [] },
    { path: 'settings', title: 'Settings', body: [] },
  ],
};

describe('resolveContentSlotState', () => {
  test('returns loading while app data is being fetched', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'orders',
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
      subPath: 'orders',
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
      subPath: 'orders',
      mode: 'stable',
      pagesJson: null,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('no-ui');
  });

  test('redirects to first top-level page when subPath is absent', () => {
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
      expect(result.to).toBe('/draft/apps/welcome/orders');
    }
  });

  test('returns not-found when subPath does not exist', () => {
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

  test('returns render state with matched path params and breadcrumbs', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'orders/1024/refund',
      mode: 'draft',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('render');
    if (result.type === 'render') {
      expect(result.match.page.path).toBe('orders/:orderId/refund');
      expect(result.match.params).toEqual({ orderId: '1024' });
      expect(result.match.breadcrumbs.map((item) => item.label)).toEqual([
        '订单列表',
        '订单 #1024',
        '退款',
      ]);
      expect(result.match.childTabs).toEqual([
        {
          label: '退款',
          subPath: 'orders/1024/refund',
          pagePath: 'orders/:orderId/refund',
          active: true,
        },
        {
          label: '日志',
          subPath: 'orders/1024/logs',
          pagePath: 'orders/:orderId/logs',
          active: false,
        },
      ]);
      expect(result.baseUrl).toBe('/draft/apps/welcome');
      expect(result.currentPath).toBe('/draft/apps/welcome/orders/1024/refund');
    }
  });

  test('hides child tabs when only one direct static child is visible', () => {
    const result = resolveContentSlotState({
      appName: 'welcome',
      subPath: 'orders',
      mode: 'draft',
      pagesJson,
      appLoading: false,
      appError: null,
    });

    expect(result.type).toBe('render');
    if (result.type === 'render') {
      expect(result.match.breadcrumbs.map((item) => item.label)).toEqual(['订单列表']);
      expect(result.match.childTabs).toEqual([]);
    }
  });
});
