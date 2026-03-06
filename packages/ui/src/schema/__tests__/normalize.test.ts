/**
 * Unit tests for normalizePagesJson / normalizeNode
 *
 * Covers:
 *  - Auto-assigns IDs to nodes that are missing them
 *  - Does not overwrite existing IDs
 *  - Recurses into children, body, tabs.items[].body, list.itemRender
 *  - Returns the same object reference (mutates in place)
 */

import { describe, expect, it } from 'bun:test';
import { normalizePagesJson, normalizeNode } from '../normalize';

describe('normalizeNode', () => {
  it('assigns an id to a node that lacks one', () => {
    const node = { type: 'text', content: 'hello' };
    normalizeNode(node);
    expect(typeof (node as Record<string, unknown>).id).toBe('string');
    expect((node as Record<string, unknown>).id).toMatch(/^text-/);
  });

  it('preserves an existing id', () => {
    const node = { type: 'text', id: 'text-abc12', content: 'hello' };
    normalizeNode(node);
    expect((node as Record<string, unknown>).id).toBe('text-abc12');
  });

  it('recurses into children array', () => {
    const child = { type: 'button', label: 'Click' };
    const node = { type: 'row', id: 'row-aaaaa', children: [child] };
    normalizeNode(node);
    expect(typeof (child as Record<string, unknown>).id).toBe('string');
    expect((child as Record<string, unknown>).id).toMatch(/^button-/);
  });

  it('recurses into body array', () => {
    const child = { type: 'text', content: 'hi' };
    const node = { type: 'card', id: 'card-aaaaa', body: [child] };
    normalizeNode(node);
    expect(typeof (child as Record<string, unknown>).id).toBe('string');
  });

  it('recurses into tabs.items[].body', () => {
    const bodyNode = { type: 'text', content: 'tab content' };
    const node = {
      type: 'tabs',
      id: 'tabs-aaaaa',
      items: [{ key: 'tab1', label: 'Tab 1', body: [bodyNode] }],
    };
    normalizeNode(node);
    expect(typeof (bodyNode as Record<string, unknown>).id).toBe('string');
  });

  it('recurses into list.itemRender', () => {
    const itemRender = { type: 'text', content: '${item.name}' };
    const node = { type: 'list', id: 'list-aaaaa', itemRender };
    normalizeNode(node);
    expect(typeof (itemRender as Record<string, unknown>).id).toBe('string');
  });

  it('does nothing for non-object inputs', () => {
    expect(() => normalizeNode(null)).not.toThrow();
    expect(() => normalizeNode(undefined)).not.toThrow();
    expect(() => normalizeNode('string')).not.toThrow();
    expect(() => normalizeNode(42)).not.toThrow();
  });

  it('does nothing if type is missing', () => {
    const node = { content: 'no type' };
    normalizeNode(node);
    expect((node as Record<string, unknown>).id).toBeUndefined();
  });
});

describe('normalizePagesJson', () => {
  it('assigns IDs to nodes in pages.body', () => {
    const btn = { type: 'button', label: 'OK' };
    const data = {
      pages: [
        {
          path: 'page-home',
          title: 'Home',
          body: [btn],
        },
      ],
    };
    normalizePagesJson(data);
    expect(typeof (btn as Record<string, unknown>).id).toBe('string');
    expect((btn as Record<string, unknown>).id).toMatch(/^button-/);
  });

  it('does not overwrite IDs already present', () => {
    const btn = { type: 'button', id: 'button-exist', label: 'OK' };
    const data = {
      pages: [
        { path: 'page-home', title: 'Home', body: [btn] },
      ],
    };
    normalizePagesJson(data);
    expect((btn as Record<string, unknown>).id).toBe('button-exist');
  });

  it('returns the same reference (mutates in place)', () => {
    const data = { pages: [{ path: 'page-x', title: 'X', body: [] }] };
    const result = normalizePagesJson(data);
    expect(result).toBe(data);
  });

  it('handles pages with no body gracefully', () => {
    const data = { pages: [{ path: 'page-x', title: 'X' }] };
    expect(() => normalizePagesJson(data)).not.toThrow();
  });

  it('handles empty input gracefully', () => {
    expect(() => normalizePagesJson(null)).not.toThrow();
    expect(() => normalizePagesJson(undefined)).not.toThrow();
    expect(() => normalizePagesJson({})).not.toThrow();
  });

  it('recurses deeply into nested containers', () => {
    const deepNode = { type: 'text', content: 'deep' };
    const data = {
      pages: [
        {
          path: 'page-home',
          title: 'Home',
          body: [
            {
              type: 'row',
              id: 'row-1',
              children: [
                {
                  type: 'col',
                  id: 'col-1',
                  children: [deepNode],
                },
              ],
            },
          ],
        },
      ],
    };
    normalizePagesJson(data);
    expect(typeof (deepNode as Record<string, unknown>).id).toBe('string');
    expect((deepNode as Record<string, unknown>).id).toMatch(/^text-/);
  });
});
