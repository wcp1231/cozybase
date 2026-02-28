import { describe, expect, test } from 'bun:test';
import { filterAppsByTab } from './app-list';

const apps = [
  { name: 'stable-app', state: 'stable' },
  { name: 'draft-app', state: 'draft_only' },
  { name: 'hybrid-app', state: 'stable_draft' },
] as const;

describe('filterAppsByTab', () => {
  test('returns stable and stable_draft apps for stable tab', () => {
    expect(filterAppsByTab([...apps], 'stable').map((app) => app.name)).toEqual([
      'stable-app',
      'hybrid-app',
    ]);
  });

  test('returns draft_only and stable_draft apps for draft tab', () => {
    expect(filterAppsByTab([...apps], 'draft').map((app) => app.name)).toEqual([
      'draft-app',
      'hybrid-app',
    ]);
  });
});
