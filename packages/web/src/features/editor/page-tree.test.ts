import { describe, expect, test } from 'bun:test';
import type { PageSchema } from '@cozybase/ui';

import { buildPageTree } from './page-tree';

describe('buildPageTree', () => {
  test('nests pages by path segments', () => {
    const pages = [
      { path: 'home', title: 'Home', body: [] },
      { path: 'settings', title: 'Settings', body: [] },
      { path: 'settings/profile', title: 'Profile', body: [] },
      { path: 'settings/profile/security', title: 'Security', body: [] },
    ] satisfies PageSchema[];

    const tree = buildPageTree(pages);

    expect(tree.map((node) => node.path)).toEqual(['home', 'settings']);
    expect(tree[1]?.page?.title).toBe('Settings');
    expect(tree[1]?.children.map((node) => node.path)).toEqual(['settings/profile']);
    expect(tree[1]?.children[0]?.page?.title).toBe('Profile');
    expect(tree[1]?.children[0]?.children[0]?.page?.title).toBe('Security');
  });

  test('creates virtual group nodes for missing intermediate paths', () => {
    const pages = [
      { path: 'docs/getting-started', title: 'Getting Started', body: [] },
      { path: 'docs/api/auth', title: 'Auth API', body: [] },
      { path: 'users/:id', title: 'User Detail', body: [] },
    ] satisfies PageSchema[];

    const tree = buildPageTree(pages);

    expect(tree.map((node) => node.path)).toEqual(['docs', 'users']);
    expect(tree[0]?.page).toBeNull();
    expect(tree[0]?.children.map((node) => node.path)).toEqual(['docs/getting-started', 'docs/api']);
    expect(tree[0]?.children[1]?.page).toBeNull();
    expect(tree[0]?.children[1]?.children[0]?.page?.title).toBe('Auth API');
    expect(tree[1]?.children[0]?.page?.title).toBe('User Detail');
  });
});
