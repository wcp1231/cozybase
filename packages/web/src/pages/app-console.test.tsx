import { describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar } from '../features/shell/app-sidebar';
import { AppConsolePage } from './app-console';
import { AppContext, type AppContextValue } from './app-layout';

const pagesJson: PagesJson = {
  pages: [
    { path: 'orders', title: '订单列表', body: [] },
  ],
};

function renderWithAppContext(
  ui: JSX.Element,
  contextOverrides: Partial<AppContextValue> = {},
  initialEntry = '/stable/apps/myapp/console',
) {
  const context: AppContextValue = {
    mode: 'stable',
    apps: [],
    appsLoading: false,
    appsError: null,
    appName: 'myapp',
    app: {
      slug: 'myapp',
      displayName: 'My App',
      description: 'Test app',
      stableStatus: 'running',
      hasDraft: true,
      current_version: 2,
      published_version: 1,
    },
    pagesJson: null,
    appLoading: false,
    appError: null,
    refreshApps: async () => {},
    refreshApp: async () => {},
    openSidebar: () => {},
    toggleSidebar: () => {},
    sidebarVisible: true,
    ...contextOverrides,
  };

  return renderToStaticMarkup(
    <AppContext.Provider value={context}>
      <MemoryRouter initialEntries={[initialEntry]}>
        {ui}
      </MemoryRouter>
    </AppContext.Provider>,
  );
}

describe('App console UI shell', () => {
  test('sidebar does not expose a Console link for the selected app', () => {
    const html = renderWithAppContext(<AppSidebar collapsed={false} />);

    expect(html).toContain('APP 列表');
    expect(html).not.toContain('/stable/apps/myapp/console');
  });

  test('console page renders the new header breadcrumb and primary tabs', () => {
    const html = renderWithAppContext(
      <AppConsolePage />,
      {
        mode: 'draft',
        pagesJson,
      },
      '/draft/apps/myapp/console?tab=schedules',
    );

    expect(html).toContain('My App');
    expect(html).toContain('草稿');
    expect(html).toContain('Console');
    expect(html).toContain('href="/draft/apps/myapp/orders"');
    expect(html).toContain('错误日志');
    expect(html).toContain('定时任务');
    expect(html).toContain('数据库');
    expect(html).toContain('源码');
  });

  test('source tab is available in draft mode only', () => {
    const draftHtml = renderWithAppContext(
      <AppConsolePage />,
      {
        mode: 'draft',
      },
      '/draft/apps/myapp/console?tab=source',
    );
    const stableHtml = renderWithAppContext(
      <AppConsolePage />,
      {
        mode: 'stable',
      },
      '/stable/apps/myapp/console?tab=source',
    );

    expect(draftHtml).toContain('文件目录');
    expect(draftHtml).toContain('Draft APP 源码');
    expect(draftHtml).toContain('源码');
    expect(stableHtml).not.toContain('文件目录');
    expect(stableHtml).not.toContain('Draft APP 源码');
  });
});
