import { describe, expect, test } from 'bun:test';
import { filterAppsByTab } from './app-list';

const apps = [
  { name: 'stable-app', stableStatus: 'running', hasDraft: false },
  { name: 'draft-app', stableStatus: null, hasDraft: true },
  { name: 'hybrid-app', stableStatus: 'stopped', hasDraft: true },
] as const;

describe('filterAppsByTab', () => {
  test('returns published apps for stable tab', () => {
    expect(filterAppsByTab([...apps], 'stable').map((app) => app.name)).toEqual([
      'stable-app',
      'hybrid-app',
    ]);
  });

  test('returns apps with draft changes for draft tab', () => {
    expect(filterAppsByTab([...apps], 'draft').map((app) => app.name)).toEqual([
      'draft-app',
      'hybrid-app',
    ]);
  });
});
