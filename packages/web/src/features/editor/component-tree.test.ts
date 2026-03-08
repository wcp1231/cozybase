import { describe, expect, test } from 'bun:test';
import type { PageSchema } from '@cozybase/ui';

import { buildComponentTree, collectAncestorIds } from './component-tree';

describe('component-tree model', () => {
  const page: PageSchema = {
    path: 'home',
    title: 'Home',
    body: [
      {
        type: 'row',
        id: 'layout-row',
        children: [
          { type: 'text', id: 'hero-title', text: 'Hello' },
          {
            type: 'form',
            id: 'profile-form',
            fields: [
              { name: 'email', label: 'Email', type: 'text', required: true },
              { name: 'status', label: 'Status', type: 'select' },
            ],
          },
          {
            type: 'table',
            id: 'users-table',
            api: { url: '/users' },
            columns: [
              { name: 'name', label: 'Name' },
              {
                name: 'status',
                label: 'Status',
                render: { type: 'tag', id: 'status-tag', text: '${row.status}' },
              },
            ],
            rowActions: [
              {
                label: 'Inspect',
                action: {
                  type: 'dialog',
                  title: 'Inspect User',
                  body: {
                    type: 'card',
                    id: 'inspect-card',
                    children: [{ type: 'text', id: 'inspect-copy', text: 'Inspect' }],
                  },
                },
              },
            ],
          },
        ],
      },
    ],
  };

  test('nests column render and dialogs under their semantic parents', () => {
    const tree = buildComponentTree(page);
    const row = tree[0];
    const form = row?.children[1];
    const table = row?.children[2];
    const statusColumn = table?.children[1];

    expect(row?.kind).toBe('component');
    expect(form?.kind).toBe('component');
    expect(form?.children.map((child) => child.id)).toEqual([
      'field:profile-form:0',
      'field:profile-form:1',
    ]);
    expect(form?.children[0]?.label).toBe('text');
    expect(form?.children[0]?.subtitle).toBe('Email · email · 必填');
    expect(table?.kind).toBe('component');
    expect(statusColumn?.kind).toBe('column');
    expect(statusColumn?.label).toBe('column');
    expect(statusColumn?.subtitle).toBe('Status · status · 有渲染');
    expect(statusColumn?.children[0]?.id).toBe('node:status-tag');

    const rowActionGroup = table?.children.find((child) => child.id === 'group:row-action:users-table:0');
    expect(rowActionGroup?.children[0]?.id.startsWith('dialog:users-table:')).toBe(true);
    expect(rowActionGroup?.children[0]?.label).toBe('dialog');
    expect(rowActionGroup?.children[0]?.subtitle).toBe('Inspect User · 点击打开预览');
    expect(rowActionGroup?.children[0]?.children[0]?.id).toBe('node:inspect-card');
    expect(rowActionGroup?.children[0]?.children[0]?.children[0]?.id).toBe('node:inspect-copy');
  });

  test('tracks ancestors for deep component and column selections', () => {
    const tree = buildComponentTree(page);
    const { ancestorBySelectableId } = collectAncestorIds(tree);

    expect(ancestorBySelectableId.get('status-tag')).toEqual([
      'node:layout-row',
      'node:users-table',
      'column:users-table:1',
    ]);
    expect(ancestorBySelectableId.get('column:users-table:1')).toEqual([
      'node:layout-row',
      'node:users-table',
    ]);
    expect(ancestorBySelectableId.get('field:profile-form:1')).toEqual([
      'node:layout-row',
      'node:profile-form',
    ]);
    expect(ancestorBySelectableId.get('inspect-copy')).toEqual([
      'node:layout-row',
      'node:users-table',
      'group:row-action:users-table:0',
      expect.stringContaining('dialog:users-table:'),
      'node:inspect-card',
    ]);
  });

  test('column render keys change when plain columns swap order', () => {
    const reorderedPage: PageSchema = {
      ...page,
      body: [
        {
          ...(page.body[0] as any),
          children: [
            (page.body[0] as any).children[0],
            (page.body[0] as any).children[1],
            {
              ...((page.body[0] as any).children[2]),
              columns: [
                { name: 'status', label: 'Status' },
                { name: 'name', label: 'Name' },
              ],
            },
          ],
        },
      ],
    };

    const originalTree = buildComponentTree(page);
    const reorderedTree = buildComponentTree(reorderedPage);
    const originalTable = originalTree[0]?.children[2];
    const reorderedTable = reorderedTree[0]?.children[2];

    expect(originalTable?.children.map((child) => child.renderKey ?? child.id)).toEqual([
      JSON.stringify({ name: 'name', label: 'Name', width: null, hasRender: false, renderId: null }),
      JSON.stringify({ name: 'status', label: 'Status', width: null, hasRender: true, renderId: 'status-tag' }),
      'group:row-action:users-table:0',
    ]);
    expect(reorderedTable?.children.map((child) => child.renderKey ?? child.id).slice(0, 2)).toEqual([
      JSON.stringify({ name: 'status', label: 'Status', width: null, hasRender: false, renderId: null }),
      JSON.stringify({ name: 'name', label: 'Name', width: null, hasRender: false, renderId: null }),
    ]);
  });
});
