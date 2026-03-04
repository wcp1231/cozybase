/**
 * MCP Page Tools — Integration Tests
 *
 * Tests that the MCP handler layer (handlePage*) produces correct output
 * when called through a HandlerContext, simulating what both the daemon
 * MCP server and SDK MCP server do.
 *
 * Both servers call the same handlers — this verifies the handler pipeline
 * works end-to-end.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  handlePageOutline,
  handlePageGet,
  handlePageInsert,
  handlePageUpdate,
  handlePageMove,
  handlePageDelete,
  PageEditorError,
} from '../../src/mcp/handlers';
import type { HandlerContext } from '../../src/mcp/handlers';

// ============================================================
// Test setup
// ============================================================

let tempDir: string;
let appsDir: string;
const APP_NAME = 'mcp-test-app';

function makeCtx(): HandlerContext {
  return {
    appsDir,
    // HandlerContext.backend is not used by page tools
    backend: null as unknown as HandlerContext['backend'],
  };
}

function writePagesJson(data: unknown) {
  const uiDir = join(appsDir, APP_NAME, 'ui');
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(join(uiDir, 'pages.json'), JSON.stringify(data, null, 2), 'utf-8');
}

function makeSampleDoc() {
  return {
    pages: [
      {
        id: 'page-main',
        title: 'Main',
        body: [
          { type: 'text', id: 'txt-title', text: 'Welcome' },
          {
            type: 'row',
            id: 'row-actions',
            children: [],
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'cozybase-mcp-page-'));
  appsDir = tempDir;
  writePagesJson(makeSampleDoc());
});

afterEach(() => {
  if (existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// ============================================================
// handlePageOutline
// ============================================================

describe('handlePageOutline', () => {
  test('returns page outline', () => {
    const result = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].id).toBe('page-main');
    expect(result.pages[0].body).toHaveLength(2);
  });

  test('filters by page_id', () => {
    const result = handlePageOutline(makeCtx(), { app_name: APP_NAME, page_id: 'page-main' });
    expect(result.pages).toHaveLength(1);
  });

  test('throws on missing app', () => {
    expect(() =>
      handlePageOutline({ appsDir, backend: null as never }, { app_name: 'no-such-app' }),
    ).toThrow(PageEditorError);
  });

  test('includes singleton-slot nodes in the outline tree', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            {
              type: 'table',
              id: 'table-main',
              api: { url: '/fn/_db/tables/orders' },
              columns: [
                {
                  name: 'status',
                  label: 'Status',
                  render: { type: 'tag', id: 'tag-status', text: 'ok' },
                },
              ],
            },
            {
              type: 'list',
              id: 'list-main',
              api: { url: '/fn/_db/tables/orders' },
              itemRender: { type: 'text', id: 'item-text', text: '${item.name}' },
            },
            {
              type: 'button',
              id: 'btn-open',
              label: 'Open',
              action: [
                {
                  type: 'dialog',
                  title: 'Details',
                  body: { type: 'text', id: 'dialog-text', text: 'Dialog content' },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    const body = result.pages[0].body;

    expect(body.find((n) => n.id === 'table-main')?.children?.some((n) => n.id === 'tag-status')).toBe(true);
    expect(body.find((n) => n.id === 'list-main')?.children?.some((n) => n.id === 'item-text')).toBe(true);
    expect(body.find((n) => n.id === 'btn-open')?.children?.some((n) => n.id === 'dialog-text')).toBe(true);
  });

  test('throws VALIDATION_ERROR when working copy pages.json is invalid', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            { type: 'text', id: 'dup-node', text: 'A' },
            { type: 'text', id: 'dup-node', text: 'B' },
          ],
        },
      ],
    });

    expect(() => handlePageOutline(makeCtx(), { app_name: APP_NAME })).toThrow(PageEditorError);
    try {
      handlePageOutline(makeCtx(), { app_name: APP_NAME });
    } catch (e) {
      expect((e as PageEditorError).code).toBe('VALIDATION_ERROR');
    }
  });
});

// ============================================================
// handlePageGet
// ============================================================

describe('handlePageGet', () => {
  test('returns the full node by id', () => {
    const node = handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((node as Record<string, unknown>).id).toBe('txt-title');
    expect((node as Record<string, unknown>).type).toBe('text');
    expect((node as Record<string, unknown>).text).toBe('Welcome');
  });

  test('returns singleton-slot nodes by id', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            {
              type: 'table',
              id: 'table-main',
              api: { url: '/fn/_db/tables/orders' },
              columns: [
                {
                  name: 'status',
                  label: 'Status',
                  render: { type: 'tag', id: 'tag-status', text: 'ok' },
                },
              ],
            },
          ],
        },
      ],
    });

    const node = handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'tag-status' });
    expect((node as Record<string, unknown>).id).toBe('tag-status');
    expect((node as Record<string, unknown>).type).toBe('tag');
    expect((node as Record<string, unknown>).text).toBe('ok');
  });

  test('throws NODE_NOT_FOUND for unknown id', () => {
    expect(() =>
      handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'nonexistent' }),
    ).toThrow(PageEditorError);
  });
});

// ============================================================
// handlePageInsert
// ============================================================

describe('handlePageInsert', () => {
  test('inserts a new text node into a row', () => {
    const inserted = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'Action info' },
    });
    expect((inserted as Record<string, unknown>).type).toBe('text');
    expect(typeof (inserted as Record<string, unknown>).id).toBe('string');
  });

  test('auto-generates id (ignores provided id)', () => {
    const inserted = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'x', id: 'manual-id' },
    });
    expect((inserted as Record<string, unknown>).id).not.toBe('manual-id');
  });

  test('throws INVALID_PARENT for non-container', () => {
    expect(() =>
      handlePageInsert(makeCtx(), {
        app_name: APP_NAME,
        parent_id: 'txt-title',
        node: { type: 'text', text: 'child' },
      }),
    ).toThrow(PageEditorError);
  });

  test('inserted node is visible via handlePageGet', () => {
    const inserted = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'Persisted' },
    });
    const id = (inserted as Record<string, unknown>).id as string;
    const fetched = handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: id });
    expect((fetched as Record<string, unknown>).id).toBe(id);
  });

  test('inserts into page body when parent_id is a page id', () => {
    const inserted = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'page-main',
      node: { type: 'text', text: 'At root' },
      index: 0,
    });

    const id = (inserted as Record<string, unknown>).id as string;
    const outline = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    expect(outline.pages[0].body[0].id).toBe(id);
    expect(outline.pages[0].body[0].type).toBe('text');
  });
});

// ============================================================
// handlePageUpdate
// ============================================================

describe('handlePageUpdate', () => {
  test('updates a node property', () => {
    handlePageUpdate(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
      props: { text: 'Updated' },
    });
    const node = handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((node as Record<string, unknown>).text).toBe('Updated');
  });

  test('rejects id change with FORBIDDEN_UPDATE', () => {
    try {
      handlePageUpdate(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'txt-title',
        props: { id: 'new-id' },
      });
      expect(true).toBe(false); // should not reach here
    } catch (e) {
      expect(e instanceof PageEditorError).toBe(true);
      expect((e as PageEditorError).code).toBe('FORBIDDEN_UPDATE');
    }
  });

  test('rejects type change with FORBIDDEN_UPDATE', () => {
    try {
      handlePageUpdate(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'txt-title',
        props: { type: 'heading' },
      });
      expect(true).toBe(false);
    } catch (e) {
      expect((e as PageEditorError).code).toBe('FORBIDDEN_UPDATE');
    }
  });
});

// ============================================================
// handlePageMove
// ============================================================

describe('handlePageMove', () => {
  test('moves a node to a new parent', () => {
    // Insert a card to move txt-title into
    const card = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'card', children: [] },
    });
    const cardId = (card as Record<string, unknown>).id as string;

    handlePageMove(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
      new_parent_id: cardId,
    });

    // txt-title should be findable
    const moved = handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((moved as Record<string, unknown>).id).toBe('txt-title');

    // txt-title should no longer be at the page body root
    const outline = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    const rootBodyIds = outline.pages[0].body.map((n) => n.id);
    expect(rootBodyIds).not.toContain('txt-title');
  });

  test('throws NODE_NOT_FOUND for unknown node', () => {
    expect(() =>
      handlePageMove(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'no-such-node',
        new_parent_id: 'row-actions',
      }),
    ).toThrow(PageEditorError);
  });

  test('moves an optional singleton-slot node into a container', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            { type: 'row', id: 'row-actions', children: [] },
            {
              type: 'table',
              id: 'table-main',
              api: { url: '/fn/_db/tables/orders' },
              columns: [
                {
                  name: 'status',
                  label: 'Status',
                  render: { type: 'tag', id: 'tag-status', text: 'ok' },
                },
              ],
            },
          ],
        },
      ],
    });

    const moved = handlePageMove(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'tag-status',
      new_parent_id: 'row-actions',
    });

    expect((moved as Record<string, unknown>).id).toBe('tag-status');
    const outline = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    expect(outline.pages[0].body.find((n) => n.id === 'row-actions')?.children?.some((n) => n.id === 'tag-status')).toBe(true);
    expect(outline.pages[0].body.find((n) => n.id === 'table-main')?.children?.some((n) => n.id === 'tag-status') ?? false).toBe(false);
  });

  test('rejects moving a required singleton-slot node', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            { type: 'row', id: 'row-actions', children: [] },
            {
              type: 'list',
              id: 'list-main',
              api: { url: '/fn/_db/tables/orders' },
              itemRender: { type: 'text', id: 'item-text', text: '${item.name}' },
            },
          ],
        },
      ],
    });

    expect(() =>
      handlePageMove(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'item-text',
        new_parent_id: 'row-actions',
      }),
    ).toThrow(PageEditorError);
    try {
      handlePageMove(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'item-text',
        new_parent_id: 'row-actions',
      });
    } catch (e) {
      expect((e as PageEditorError).code).toBe('INVALID_PARENT');
      expect((e as PageEditorError).message).toMatch(/required singleton slot/);
    }
  });
});

// ============================================================
// handlePageDelete
// ============================================================

describe('handlePageDelete', () => {
  test('deletes a node and returns { deleted: nodeId }', () => {
    const result = handlePageDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'row-actions',
    });
    expect(result).toEqual({ deleted: 'row-actions' });
    expect(() =>
      handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'row-actions' }),
    ).toThrow(PageEditorError);
  });

  test('throws NODE_NOT_FOUND for unknown node', () => {
    expect(() =>
      handlePageDelete(makeCtx(), { app_name: APP_NAME, node_id: 'ghost' }),
    ).toThrow(PageEditorError);
  });

  test('deletes an optional singleton-slot node', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            {
              type: 'table',
              id: 'table-main',
              api: { url: '/fn/_db/tables/orders' },
              columns: [
                {
                  name: 'status',
                  label: 'Status',
                  render: { type: 'tag', id: 'tag-status', text: 'ok' },
                },
              ],
            },
          ],
        },
      ],
    });

    const result = handlePageDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'tag-status',
    });

    expect(result).toEqual({ deleted: 'tag-status' });
    expect(() =>
      handlePageGet(makeCtx(), { app_name: APP_NAME, node_id: 'tag-status' }),
    ).toThrow(PageEditorError);
    const outline = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    expect(outline.pages[0].body[0].id).toBe('table-main');
    expect(outline.pages[0].body[0].children).toBeUndefined();
  });

  test('rejects deleting a required singleton-slot node', () => {
    writePagesJson({
      pages: [
        {
          id: 'page-main',
          title: 'Main',
          body: [
            {
              type: 'button',
              id: 'btn-open',
              label: 'Open',
              action: [
                {
                  type: 'dialog',
                  title: 'Details',
                  body: { type: 'text', id: 'dialog-text', text: 'Dialog content' },
                },
              ],
            },
          ],
        },
      ],
    });

    expect(() =>
      handlePageDelete(makeCtx(), { app_name: APP_NAME, node_id: 'dialog-text' }),
    ).toThrow(PageEditorError);
    try {
      handlePageDelete(makeCtx(), { app_name: APP_NAME, node_id: 'dialog-text' });
    } catch (e) {
      expect((e as PageEditorError).code).toBe('INVALID_PARENT');
      expect((e as PageEditorError).message).toMatch(/required singleton slot/);
    }
  });
});

// ============================================================
// Consistency: both MCP servers use the same handlers
// ============================================================

describe('handler output format (used by both MCP servers)', () => {
  test('handlePageOutline returns a plain object (serializable by jsonResult)', () => {
    const result = handlePageOutline(makeCtx(), { app_name: APP_NAME });
    // Verify it's a plain serializable object
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.pages).toHaveLength(1);
  });

  test('handlePageInsert returns a plain object', () => {
    const result = handlePageInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'test' },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test('handlePageDelete returns { deleted: string }', () => {
    const result = handlePageDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
    });
    expect(result).toHaveProperty('deleted', 'txt-title');
  });
});
