import { beforeEach, describe, expect, test } from 'bun:test';
import type { PagesJson } from '@cozybase/ui';

import {
  canDeleteNode,
  insertComponentAtSelection,
  deleteNodeById,
  moveNodeBySortablePosition,
  moveNodeBeforeSibling,
} from './page-edit-ops';

const baseDoc = (): PagesJson => ({
  pages: [
    {
      path: 'home',
      title: 'Home',
      body: [
        { type: 'text', id: 'title', text: 'Hello' },
        {
          type: 'row',
          id: 'hero-row',
          children: [
            { type: 'text', id: 'hero-copy', text: 'Hero' },
            {
              type: 'list',
              id: 'hero-list',
              api: { url: '/fn/_db/tables/items' },
              itemRender: { type: 'text', id: 'hero-item', text: '${item.name}' },
            },
          ],
        },
        {
          type: 'tabs',
          id: 'tabs-main',
          items: [
            {
              label: 'Overview',
              value: 'overview',
              body: [{ type: 'text', id: 'tab-copy', text: 'Overview' }],
            },
          ],
        },
      ],
    },
    {
      path: 'settings',
      title: 'Settings',
      body: [{ type: 'text', id: 'settings-title', text: 'Settings' }],
    },
  ],
});

describe('page-edit-ops', () => {
  let doc: PagesJson;

  beforeEach(() => {
    doc = baseDoc();
  });

  test('inserts into selected container children', () => {
    insertComponentAtSelection(doc, 'home', 'hero-row', {
      type: 'button',
      id: 'cta-button',
      label: 'Go',
      action: { type: 'close' },
    } as any);

    const row = doc.pages[0].body[1] as any;
    expect(row.children.map((child: any) => child.id)).toEqual(['hero-copy', 'hero-list', 'cta-button']);
  });

  test('inserts into current page when nothing is selected', () => {
    insertComponentAtSelection(doc, 'home', null, {
      type: 'text',
      id: 'footer-copy',
      text: 'Footer',
    } as any);

    expect((doc.pages[0].body.at(-1) as any).id).toBe('footer-copy');
  });

  test('inserts after selected node for non-container nodes', () => {
    insertComponentAtSelection(doc, 'home', 'title', {
      type: 'tag',
      id: 'title-tag',
      text: 'New',
    } as any);

    expect(doc.pages[0].body.map((node) => node.id).slice(0, 3)).toEqual(['title', 'title-tag', 'hero-row']);
  });

  test('falls back to inserting after parent for singleton-slot children', () => {
    insertComponentAtSelection(doc, 'home', 'hero-item', {
      type: 'alert',
      id: 'list-after',
      message: 'Inserted',
      alertType: 'info',
    } as any);

    const row = doc.pages[0].body[1] as any;
    expect(row.children.map((child: any) => child.id)).toEqual(['hero-copy', 'hero-list', 'list-after']);
  });

  test('inserts into first tabs body when tabs node is selected', () => {
    insertComponentAtSelection(doc, 'home', 'tabs-main', {
      type: 'text',
      id: 'tab-extra',
      text: 'Extra',
    } as any);

    const tabs = doc.pages[0].body[2] as any;
    expect(tabs.items[0].body.map((node: any) => node.id)).toEqual(['tab-copy', 'tab-extra']);
  });

  test('deletes array-slot nodes and singleton-slot nodes with remove support', () => {
    deleteNodeById(doc, 'title');
    expect(doc.pages[0].body.map((node) => node.id)).toEqual(['hero-row', 'tabs-main']);
  });

  test('refuses deleting required singleton-slot nodes', () => {
    expect(canDeleteNode(doc, 'hero-item')).toBe(false);
    expect(() => deleteNodeById(doc, 'hero-item')).toThrow('required slot');
  });

  test('reorders siblings only within the same parent', () => {
    expect(moveNodeBeforeSibling(doc, 'tabs-main', 'title')).toBe(true);
    expect(doc.pages[0].body.map((node) => node.id)).toEqual(['tabs-main', 'title', 'hero-row']);
    expect(moveNodeBeforeSibling(doc, 'tab-copy', 'title')).toBe(false);
  });

  test('reorders siblings using sortable group/index snapshots', () => {
    expect(moveNodeBySortablePosition(doc, 'page:home', 'page:home', 2, 0)).toBe(true);
    expect(doc.pages[0].body.map((node) => node.id)).toEqual(['tabs-main', 'title', 'hero-row']);

    expect(moveNodeBySortablePosition(doc, 'hero-row', 'hero-row', 1, 0)).toBe(true);
    const row = doc.pages[0].body[2] as any;
    expect(row.children.map((child: any) => child.id)).toEqual(['hero-list', 'hero-copy']);
  });

  test('rejects cross-group sortable moves', () => {
    expect(moveNodeBySortablePosition(doc, 'page:home', 'hero-row', 0, 0)).toBe(false);
  });

  test('reorders tabs item body siblings using explicit slot group ids', () => {
    const tabs = doc.pages[0].body[2] as any;
    tabs.items[0].body.push({ type: 'text', id: 'tab-extra-2', text: 'Second' });

    expect(moveNodeBySortablePosition(doc, 'slot:tabs-main:tab:0', 'slot:tabs-main:tab:0', 1, 0)).toBe(true);
    expect(tabs.items[0].body.map((node: any) => node.id)).toEqual(['tab-extra-2', 'tab-copy']);
  });
});
