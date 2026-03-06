import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { AppCard } from './app-card';
import type { AppSummary } from './types';

const app: AppSummary = {
  slug: 'orders',
  displayName: 'Orders',
  description: 'Orders app',
  stableStatus: 'running',
  hasDraft: true,
  current_version: 2,
  published_version: 1,
  created_at: '2026-03-06T00:00:00.000Z',
  updated_at: '2026-03-06T00:00:00.000Z',
  has_ui: true,
};

describe('AppCard', () => {
  test('renders a stable console action in the more menu', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <AppCard
          app={app}
          mode="stable"
          to="/stable/apps/orders/home"
        />
      </MemoryRouter>,
    );

    expect(html).toContain('控制台');
    expect(html).toContain('/stable/apps/orders/console');
  });
});
