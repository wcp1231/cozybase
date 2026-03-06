import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AppPageView } from './app-page-view';
import { AppContext, type AppContextValue } from './app-layout';

function renderDraftPage() {
  const context: AppContextValue = {
    mode: 'draft',
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
    appLoading: true,
    appError: null,
    refreshApps: async () => {},
    refreshApp: async () => {},
    openSidebar: () => {},
    toggleSidebar: () => {},
    sidebarVisible: true,
  };

  return renderToStaticMarkup(
    <AppContext.Provider value={context}>
      <MemoryRouter initialEntries={['/draft/apps/myapp/home']}>
        <Routes>
          <Route path="/:mode/apps/:appName/*" element={<AppPageView />} />
        </Routes>
      </MemoryRouter>
    </AppContext.Provider>,
  );
}

describe('AppPageView draft header actions', () => {
  test('renders a console entry next to publish', () => {
    const html = renderDraftPage();

    expect(html).toContain('控制台');
    expect(html).toContain('/draft/apps/myapp/console');
    expect(html).toContain('发布');
  });
});
