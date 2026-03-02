import { describe, expect, test } from 'bun:test';
import { buildHomeMetrics, filterAppsByMode, getAppInitials } from './app-utils';

const apps = [
  {
    name: 'stable-app',
    description: '',
    stableStatus: 'running',
    hasDraft: false,
    current_version: 2,
    published_version: 2,
    created_at: '',
    updated_at: '',
    has_ui: true,
  },
  {
    name: 'draft-only',
    description: '',
    stableStatus: null,
    hasDraft: true,
    current_version: 1,
    published_version: 0,
    created_at: '',
    updated_at: '',
    has_ui: false,
  },
  {
    name: 'hybrid-app',
    description: '',
    stableStatus: 'stopped',
    hasDraft: true,
    current_version: 3,
    published_version: 2,
    created_at: '',
    updated_at: '',
    has_ui: true,
  },
] as const;

describe('filterAppsByMode', () => {
  test('returns published apps for stable mode', () => {
    expect(filterAppsByMode([...apps], 'stable').map((app) => app.name)).toEqual([
      'stable-app',
      'hybrid-app',
    ]);
  });

  test('returns apps with drafts for draft mode', () => {
    expect(filterAppsByMode([...apps], 'draft').map((app) => app.name)).toEqual([
      'draft-only',
      'hybrid-app',
    ]);
  });
});

describe('buildHomeMetrics', () => {
  test('builds stable overview metrics', () => {
    expect(buildHomeMetrics([...apps], 'stable').map((metric) => metric.value)).toEqual([
      '2',
      '1',
      '1',
      '2',
    ]);
  });

  test('builds draft overview metrics', () => {
    expect(buildHomeMetrics([...apps], 'draft').map((metric) => metric.value)).toEqual([
      '2',
      '1',
      '1',
      '1',
    ]);
  });
});

describe('getAppInitials', () => {
  test('uses first two words when present', () => {
    expect(getAppInitials('Fitness Tracker')).toBe('FT');
  });

  test('supports compact Chinese names', () => {
    expect(getAppInitials('健身追踪')).toBe('健身');
  });
});
