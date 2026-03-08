import { describe, expect, it } from 'bun:test';

import {
  findNodeById,
  findParentOfNode,
  getChildrenArray,
  isAncestorOf,
  subtreeContainsId,
  visitChildComponents,
} from '../tree-utils';
import type { PagesJson } from '../types';

function makeDoc(): PagesJson {
  return {
    pages: [
      {
        path: 'home',
        title: 'Home',
        body: [
          {
            type: 'row',
            id: 'row-main',
            children: [
              { type: 'text', id: 'text-title', text: 'Hello' },
              {
                type: 'tabs',
                id: 'tabs-main',
                items: [
                  {
                    label: 'Details',
                    value: 'details',
                    body: [{ type: 'tag', id: 'tag-details', text: 'Ready' }],
                  },
                ],
              },
              {
                type: 'list',
                id: 'list-main',
                api: { url: '/items' },
                itemRender: { type: 'text', id: 'text-item-render', text: '${item.name}' },
              },
              {
                type: 'table',
                id: 'table-main',
                api: { url: '/items' },
                columns: [
                  { name: 'name', label: 'Name' },
                  {
                    name: 'status',
                    label: 'Status',
                    render: { type: 'tag', id: 'tag-status-render', text: '${row.status}' },
                  },
                ],
                rowActions: [
                  {
                    label: 'Inspect',
                    action: {
                      type: 'dialog',
                      title: 'Inspect',
                      body: { type: 'text', id: 'text-dialog-body', text: 'Inspect row' },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('tree-utils', () => {
  it('visits direct children across array and singleton slots', () => {
    const row = makeDoc().pages[0].body[0];
    const visited: string[] = [];

    visitChildComponents(row, (child) => {
      visited.push(child.id);
    });

    expect(visited).toEqual([
      'text-title',
      'tabs-main',
      'list-main',
      'table-main',
    ]);
  });

  it('finds nested nodes inside tabs, list, table render, and dialog action body', () => {
    const doc = makeDoc();

    expect((findNodeById(doc, 'tag-details')?.parent as { id: string }).id).toBe('tabs-main');
    expect((findNodeById(doc, 'text-item-render')?.parent as { id: string }).id).toBe('list-main');
    expect((findNodeById(doc, 'tag-status-render')?.parent as { id: string }).id).toBe('table-main');
    expect((findNodeById(doc, 'text-dialog-body')?.parent as { id: string }).id).toBe('table-main');
  });

  it('returns page parent context for top-level nodes', () => {
    const doc = makeDoc();
    const parent = findParentOfNode(doc, 'row-main');
    expect(parent && 'path' in parent ? parent.path : null).toBe('home');
  });

  it('exposes mutable children arrays for pages and containers', () => {
    const doc = makeDoc();
    const pageChildren = getChildrenArray(doc.pages[0]);
    const rowChildren = getChildrenArray(doc.pages[0].body[0]);
    const row = doc.pages[0].body[0] as { children: Array<{ id: string }> };
    const textChildren = getChildrenArray(row.children[0] as any);

    expect(pageChildren?.map((node) => node.id)).toEqual(['row-main']);
    expect(rowChildren?.map((node) => node.id)).toEqual(['text-title', 'tabs-main', 'list-main', 'table-main']);
    expect(textChildren).toBeNull();
  });

  it('supports same-parent reorder without changing unaffected ids', () => {
    const doc = makeDoc();
    const rowChildren = getChildrenArray(doc.pages[0].body[0])!;
    const beforeIds = rowChildren.map((node) => node.id);
    const moved = rowChildren.splice(3, 1)[0];
    rowChildren.splice(1, 0, moved);

    expect(rowChildren.map((node) => node.id)).toEqual([
      'text-title',
      'table-main',
      'tabs-main',
      'list-main',
    ]);
    expect(beforeIds.sort()).toEqual(rowChildren.map((node) => node.id).sort());
  });

  it('detects subtree membership for ancestor guards', () => {
    const doc = makeDoc();
    const row = doc.pages[0].body[0];

    expect(subtreeContainsId(row, 'tag-status-render')).toBe(true);
    expect(subtreeContainsId(row, 'missing')).toBe(false);
    expect(isAncestorOf(row, 'row-main')).toBe(true);
    expect(isAncestorOf(row, 'text-dialog-body')).toBe(true);
    expect(isAncestorOf(row, 'missing')).toBe(false);
  });
});
