/**
 * MCP UI / Pages Tools — Integration Tests
 *
 * Tests that the MCP handler layer produces correct output when called
 * through a HandlerContext, simulating what both the daemon MCP server
 * and SDK MCP server do.
 *
 * Both servers call the same handlers — this verifies the handler pipeline
 * works end-to-end.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  handleUiOutline,
  handleUiGet,
  handleUiInsert,
  handleUiUpdate,
  handleUiMove,
  handleUiDelete,
  handleUiBatch,
  handlePagesList,
  handlePagesAdd,
  handlePagesRemove,
  handlePagesUpdate,
  handlePagesReorder,
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
    // HandlerContext.backend is not used by ui/pages tools
    backend: null as unknown as HandlerContext['backend'],
  };
}

function writePagesJson(data: unknown) {
  const uiDir = join(appsDir, APP_NAME, 'ui');
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(
    join(uiDir, 'pages.json'),
    JSON.stringify(normalizePageTestData(data), null, 2),
    'utf-8',
  );
}

function normalizePageTestData(data: unknown): unknown {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const value = data as Record<string, unknown>;
  if (!Array.isArray(value.pages)) return data;

  return {
    ...value,
    pages: value.pages.map((page) => {
      if (!page || typeof page !== 'object' || Array.isArray(page)) return page;
      const candidate = page as Record<string, unknown>;
      if (typeof candidate.path === 'string') return candidate;
      if (typeof candidate.id !== 'string') return candidate;
      const { id, ...rest } = candidate;
      return { path: id, ...rest };
    }),
  };
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
// handleUiOutline
// ============================================================

describe('handleUiOutline', () => {
  test('returns page outline', () => {
    const result = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].path).toBe('page-main');
    expect(result.pages[0].body).toHaveLength(2);
  });

  test('filters by page_path', () => {
    const result = handleUiOutline(makeCtx(), { app_name: APP_NAME, page_path: 'page-main' });
    expect(result.pages).toHaveLength(1);
  });

  test('throws on missing app', () => {
    expect(() =>
      handleUiOutline({ appsDir, backend: null as never }, { app_name: 'no-such-app' }),
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

    const result = handleUiOutline(makeCtx(), { app_name: APP_NAME });
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

    expect(() => handleUiOutline(makeCtx(), { app_name: APP_NAME })).toThrow(PageEditorError);
    try {
      handleUiOutline(makeCtx(), { app_name: APP_NAME });
    } catch (e) {
      expect((e as PageEditorError).code).toBe('VALIDATION_ERROR');
    }
  });
});

// ============================================================
// handleUiGet
// ============================================================

describe('handleUiGet', () => {
  test('returns the full node by id', () => {
    const node = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
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

    const node = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'tag-status' });
    expect((node as Record<string, unknown>).id).toBe('tag-status');
    expect((node as Record<string, unknown>).type).toBe('tag');
    expect((node as Record<string, unknown>).text).toBe('ok');
  });

  test('throws NODE_NOT_FOUND for unknown id', () => {
    expect(() =>
      handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'nonexistent' }),
    ).toThrow(PageEditorError);
  });
});

// ============================================================
// handleUiInsert
// ============================================================

describe('handleUiInsert', () => {
  test('inserts a new text node into a row', () => {
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'Action info' },
    });
    expect((inserted as Record<string, unknown>).type).toBe('text');
    expect(typeof (inserted as Record<string, unknown>).id).toBe('string');
  });

  test('auto-generates id (ignores provided id)', () => {
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'x', id: 'manual-id' },
    });
    expect((inserted as Record<string, unknown>).id).not.toBe('manual-id');
  });

  test('throws INVALID_PARENT for non-container', () => {
    expect(() =>
      handleUiInsert(makeCtx(), {
        app_name: APP_NAME,
        parent_id: 'txt-title',
        node: { type: 'text', text: 'child' },
      }),
    ).toThrow(PageEditorError);
  });

  test('inserted node is visible via handleUiGet', () => {
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'Persisted' },
    });
    const id = (inserted as Record<string, unknown>).id as string;
    const fetched = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: id });
    expect((fetched as Record<string, unknown>).id).toBe(id);
  });

  test('resolves nested $self during insert', () => {
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: {
        type: 'button',
        label: 'Refresh self',
        action: [{ type: 'reload', target: '$self' }],
      },
    }) as Record<string, unknown>;

    const action = (inserted.action as Array<Record<string, unknown>>)[0];
    expect(action.target).toBe(inserted.id);
  });

  test('inserts into page body when parent_id is a page path', () => {
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'page-main',
      node: { type: 'text', text: 'At root' },
      index: 0,
    });

    const id = (inserted as Record<string, unknown>).id as string;
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    expect(outline.pages[0].body[0].id).toBe(id);
    expect(outline.pages[0].body[0].type).toBe('text');
  });
});

// ============================================================
// handleUiUpdate
// ============================================================

describe('handleUiUpdate', () => {
  test('updates a node property', () => {
    handleUiUpdate(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
      props: { text: 'Updated' },
    });
    const node = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((node as Record<string, unknown>).text).toBe('Updated');
  });

  test('rejects id change with FORBIDDEN_UPDATE', () => {
    try {
      handleUiUpdate(makeCtx(), {
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
      handleUiUpdate(makeCtx(), {
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
// handleUiMove
// ============================================================

describe('handleUiMove', () => {
  test('moves a node to a new parent', () => {
    // Insert a card to move txt-title into
    const card = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'card', children: [] },
    });
    const cardId = (card as Record<string, unknown>).id as string;

    handleUiMove(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
      new_parent_id: cardId,
    });

    // txt-title should be findable
    const moved = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((moved as Record<string, unknown>).id).toBe('txt-title');

    // txt-title should no longer be at the page body root
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    const rootBodyIds = outline.pages[0].body.map((n) => n.id);
    expect(rootBodyIds).not.toContain('txt-title');
  });

  test('throws NODE_NOT_FOUND for unknown node', () => {
    expect(() =>
      handleUiMove(makeCtx(), {
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

    const moved = handleUiMove(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'tag-status',
      new_parent_id: 'row-actions',
    });

    expect((moved as Record<string, unknown>).id).toBe('tag-status');
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
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
      handleUiMove(makeCtx(), {
        app_name: APP_NAME,
        node_id: 'item-text',
        new_parent_id: 'row-actions',
      }),
    ).toThrow(PageEditorError);
    try {
      handleUiMove(makeCtx(), {
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
// handleUiDelete
// ============================================================

describe('handleUiDelete', () => {
  test('deletes a node and returns { deleted: nodeId }', () => {
    const result = handleUiDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'row-actions',
    });
    expect(result).toEqual({ deleted: 'row-actions' });
    expect(() =>
      handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'row-actions' }),
    ).toThrow(PageEditorError);
  });

  test('throws NODE_NOT_FOUND for unknown node', () => {
    expect(() =>
      handleUiDelete(makeCtx(), { app_name: APP_NAME, node_id: 'ghost' }),
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

    const result = handleUiDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'tag-status',
    });

    expect(result).toEqual({ deleted: 'tag-status' });
    expect(() =>
      handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'tag-status' }),
    ).toThrow(PageEditorError);
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
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
      handleUiDelete(makeCtx(), { app_name: APP_NAME, node_id: 'dialog-text' }),
    ).toThrow(PageEditorError);
    try {
      handleUiDelete(makeCtx(), { app_name: APP_NAME, node_id: 'dialog-text' });
    } catch (e) {
      expect((e as PageEditorError).code).toBe('INVALID_PARENT');
      expect((e as PageEditorError).message).toMatch(/required singleton slot/);
    }
  });
});

// ============================================================
// handleUiBatch
// ============================================================

describe('handleUiBatch', () => {
  test('supports basic multi-insert in one batch', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'insert', parent_id: 'row-actions', node: { type: 'text', text: 'A' } },
        { op: 'insert', parent_id: 'row-actions', node: { type: 'text', text: 'B' } },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.status === 'ok')).toBe(true);

    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    const rowNode = outline.pages[0].body.find((n) => n.id === 'row-actions');
    expect(rowNode?.children?.length).toBe(2);
  });

  test('supports $ref for nested insert', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'insert', ref: '$row', parent_id: 'row-actions', node: { type: 'row', children: [] } },
        { op: 'insert', parent_id: '$row', node: { type: 'text', text: 'Nested' } },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results[0].status).toBe('ok');
    expect(result.results[1].status).toBe('ok');

    const rowId = result.results[0].node_id!;
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    const parent = outline.pages[0].body.find((n) => n.id === 'row-actions');
    const nestedRow = parent?.children?.find((n) => n.id === rowId);
    expect(nestedRow).toBeDefined();
    expect(nestedRow?.children?.length).toBe(1);
  });

  test('supports mixed insert + update + delete in one batch', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'insert', ref: '$n', parent_id: 'row-actions', node: { type: 'text', text: 'Temp' } },
        { op: 'update', node_id: '$n', props: { text: 'Updated Temp' } },
        { op: 'delete', node_id: '$n' },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);

    const deletedId = result.results[2].node_id!;
    expect(() =>
      handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: deletedId }),
    ).toThrow(PageEditorError);
  });

  test('continues unrelated operations when one operation fails', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'insert', parent_id: 'row-actions', node: { type: 'text', text: 'OK 1' } },
        { op: 'insert', parent_id: 'non-existent-parent', node: { type: 'text', text: 'FAIL' } },
        { op: 'update', node_id: 'txt-title', props: { text: 'Still runs' } },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'error', 'ok']);

    const title = handleUiGet(makeCtx(), { app_name: APP_NAME, node_id: 'txt-title' });
    expect((title as Record<string, unknown>).text).toBe('Still runs');
  });

  test('marks dependent operations as skipped when referenced ref failed', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'insert', ref: '$container', parent_id: 'missing-parent', node: { type: 'row', children: [] } },
        { op: 'insert', parent_id: '$container', node: { type: 'text', text: 'Skipped' } },
        { op: 'update', node_id: 'txt-title', props: { text: 'Independent' } },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results[0].status).toBe('error');
    expect(result.results[1].status).toBe('skipped');
    expect(result.results[2].status).toBe('ok');
    expect(result.results[1].skipped_reason).toContain('$container');
  });

  test('supports page_add + insert in the same batch', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'page_add', ref: '$settings', path: 'settings', title: 'Settings' },
        { op: 'insert', parent_id: '$settings', node: { type: 'text', text: 'Settings Page' } },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok']);

    const pages = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(pages.pages.some((p) => p.path === 'settings')).toBe(true);

    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME, page_path: 'settings' });
    expect(outline.pages).toHaveLength(1);
    expect(outline.pages[0].body).toHaveLength(1);
  });

  test('resolves nested $self in batch insert payloads', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        {
          op: 'insert',
          parent_id: 'row-actions',
          node: {
            type: 'button',
            label: 'Refresh self',
            action: [{ type: 'reload', target: '$self' }],
          },
        },
      ],
    });

    expect(result.committed).toBe(true);
    const node = result.results[0].node as Record<string, unknown>;
    const action = (node.action as Array<Record<string, unknown>>)[0];
    expect(action.target).toBe(node.id);
  });

  test('resolves nested refs from earlier batch operations', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        {
          op: 'insert',
          ref: '$table',
          parent_id: 'page-main',
          node: {
            type: 'table',
            api: { url: '/fn/_db/tables/users', method: 'GET' },
            columns: [{ name: 'id', label: 'ID' }],
          },
        },
        {
          op: 'insert',
          parent_id: 'row-actions',
          node: {
            type: 'button',
            label: 'Refresh table',
            action: [{ type: 'reload', target: '$table' }],
          },
        },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok']);

    const button = result.results[1].node as Record<string, unknown>;
    const action = (button.action as Array<Record<string, unknown>>)[0];
    expect(action.target).toBe(result.results[0].node_id);
  });

  test('resolves nested refs in update props', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        {
          op: 'insert',
          ref: '$table',
          parent_id: 'page-main',
          node: {
            type: 'table',
            api: { url: '/fn/_db/tables/users', method: 'GET' },
            columns: [{ name: 'id', label: 'ID' }],
          },
        },
        {
          op: 'insert',
          ref: '$button',
          parent_id: 'row-actions',
          node: { type: 'button', label: 'Refresh table', action: { type: 'link', url: '/users' } },
        },
        {
          op: 'update',
          node_id: '$button',
          props: { action: [{ type: 'reload', target: '$table' }] },
        },
      ],
    });

    expect(result.committed).toBe(true);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok', 'ok']);

    const updated = result.results[2].node as Record<string, unknown>;
    const action = (updated.action as Array<Record<string, unknown>>)[0];
    expect(action.target).toBe(result.results[0].node_id);
  });

  test('does not write pages.json for pure get batches', () => {
    const filePath = join(appsDir, APP_NAME, 'ui', 'pages.json');
    const before = readFileSync(filePath, 'utf-8');

    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'get', node_id: 'txt-title' },
        { op: 'get', node_id: 'row-actions' },
      ],
    });

    const after = readFileSync(filePath, 'utf-8');
    expect(result.committed).toBe(false);
    expect(result.results.map((r) => r.status)).toEqual(['ok', 'ok']);
    expect(after).toBe(before);
  });

  test('returns committed=false with empty operations', () => {
    const filePath = join(appsDir, APP_NAME, 'ui', 'pages.json');
    const before = readFileSync(filePath, 'utf-8');

    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [],
    });

    const after = readFileSync(filePath, 'utf-8');
    expect(result.committed).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(after).toBe(before);
  });

  test('rejects update id/type modifications with FORBIDDEN_UPDATE', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        { op: 'update', node_id: 'txt-title', props: { id: 'new-id' } },
        { op: 'update', node_id: 'txt-title', props: { type: 'heading' } },
      ],
    });

    expect(result.committed).toBe(false);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe('error');
    expect(result.results[1].status).toBe('error');
    expect(result.results[0].error?.code).toBe('FORBIDDEN_UPDATE');
    expect(result.results[1].error?.code).toBe('FORBIDDEN_UPDATE');
  });

  test('errors on unresolved nested refs in batch payloads', () => {
    const result = handleUiBatch(makeCtx(), {
      app_name: APP_NAME,
      operations: [
        {
          op: 'insert',
          parent_id: 'row-actions',
          node: {
            type: 'button',
            label: 'Broken',
            action: [{ type: 'reload', target: '$missing' }],
          },
        },
      ],
    });

    expect(result.committed).toBe(false);
    expect(result.results[0].status).toBe('error');
    expect(result.results[0].error?.code).toBe('VALIDATION_ERROR');
  });
});

// ============================================================
// handlePagesList
// ============================================================

describe('handlePagesList', () => {
  test('returns all page paths and titles', () => {
    writePagesJson({
      pages: [
        { id: 'home', title: 'Home', body: [] },
        { id: 'settings', title: 'Settings', body: [] },
      ],
    });
    const result = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0]).toEqual({ path: 'home', title: 'Home' });
    expect(result.pages[1]).toEqual({ path: 'settings', title: 'Settings' });
  });

  test('returns empty array when pages is empty', () => {
    writePagesJson({ pages: [] });
    const result = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(result.pages).toHaveLength(0);
  });
});

// ============================================================
// handlePagesAdd
// ============================================================

describe('handlePagesAdd', () => {
  test('adds a new page and returns {path, title}', () => {
    writePagesJson({ pages: [] });
    const result = handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'dashboard', title: 'Dashboard' });
    expect(result).toEqual({ path: 'dashboard', title: 'Dashboard' });
    const list = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(list.pages).toHaveLength(1);
  });

  test('inserts at specified index', () => {
    writePagesJson({
      pages: [
        { id: 'home', title: 'Home', body: [] },
        { id: 'about', title: 'About', body: [] },
      ],
    });
    handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'settings', title: 'Settings', index: 1 });
    const list = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(list.pages[1].path).toBe('settings');
    expect(list.pages[2].path).toBe('about');
  });

  test('throws on duplicate page path', () => {
    writePagesJson({ pages: [{ id: 'home', title: 'Home', body: [] }] });
    expect(() =>
      handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'home', title: 'Home 2' }),
    ).toThrow(PageEditorError);
  });

  test('throws on invalid page path format', () => {
    writePagesJson({ pages: [] });
    expect(() =>
      handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'My Page', title: 'Bad' }),
    ).toThrow(PageEditorError);
  });

  test('page body can be populated via ui_insert after pages_add', () => {
    writePagesJson({ pages: [] });
    handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'dashboard', title: 'Dashboard' });
    const inserted = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'dashboard',
      node: { type: 'text', text: 'Hello' },
    });
    const outline = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    expect(outline.pages[0].body[0].id).toBe((inserted as Record<string, unknown>).id);
  });
});

// ============================================================
// handlePagesRemove
// ============================================================

describe('handlePagesRemove', () => {
  test('removes a page and returns { deleted: page_path }', () => {
    writePagesJson({
      pages: [
        { id: 'home', title: 'Home', body: [] },
        { id: 'about', title: 'About', body: [] },
      ],
    });
    const result = handlePagesRemove(makeCtx(), { app_name: APP_NAME, page_path: 'home' });
    expect(result).toEqual({ deleted: 'home' });
    const list = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(list.pages).toHaveLength(1);
    expect(list.pages[0].path).toBe('about');
  });

  test('throws on non-existent page', () => {
    writePagesJson({ pages: [] });
    expect(() =>
      handlePagesRemove(makeCtx(), { app_name: APP_NAME, page_path: 'no-such' }),
    ).toThrow(PageEditorError);
  });
});

// ============================================================
// handlePagesUpdate
// ============================================================

describe('handlePagesUpdate', () => {
  test('updates page title', () => {
    writePagesJson({ pages: [{ id: 'home', title: 'Home', body: [] }] });
    const result = handlePagesUpdate(makeCtx(), { app_name: APP_NAME, page_path: 'home', title: 'Homepage' });
    expect(result).toEqual({ path: 'home', title: 'Homepage' });
    const list = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(list.pages[0].title).toBe('Homepage');
  });

  test('throws on non-existent page', () => {
    writePagesJson({ pages: [] });
    expect(() =>
      handlePagesUpdate(makeCtx(), { app_name: APP_NAME, page_path: 'no-such', title: 'X' }),
    ).toThrow(PageEditorError);
  });
});

// ============================================================
// handlePagesReorder
// ============================================================

describe('handlePagesReorder', () => {
  beforeEach(() => {
    writePagesJson({
      pages: [
        { id: 'home', title: 'Home', body: [] },
        { id: 'about', title: 'About', body: [] },
        { id: 'contact', title: 'Contact', body: [] },
      ],
    });
  });

  test('moves page to new position', () => {
    handlePagesReorder(makeCtx(), { app_name: APP_NAME, page_path: 'contact', index: 0 });
    const list = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(list.pages.map((p) => p.path)).toEqual(['contact', 'home', 'about']);
  });

  test('returns updated page list', () => {
    const result = handlePagesReorder(makeCtx(), { app_name: APP_NAME, page_path: 'home', index: 2 });
    expect(result.pages.map((p) => p.path)).toEqual(['about', 'contact', 'home']);
  });

  test('throws on non-existent page', () => {
    expect(() =>
      handlePagesReorder(makeCtx(), { app_name: APP_NAME, page_path: 'no-such', index: 0 }),
    ).toThrow(PageEditorError);
  });

  test('throws on out-of-range index', () => {
    expect(() =>
      handlePagesReorder(makeCtx(), { app_name: APP_NAME, page_path: 'home', index: 10 }),
    ).toThrow(PageEditorError);
  });
});

// ============================================================
// Consistency: both MCP servers use the same handlers
// ============================================================

describe('handler output format (used by both MCP servers)', () => {
  test('handleUiOutline returns a plain object (serializable by jsonResult)', () => {
    const result = handleUiOutline(makeCtx(), { app_name: APP_NAME });
    expect(() => JSON.stringify(result)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(result));
    expect(parsed.pages).toHaveLength(1);
  });

  test('handleUiInsert returns a plain object', () => {
    const result = handleUiInsert(makeCtx(), {
      app_name: APP_NAME,
      parent_id: 'row-actions',
      node: { type: 'text', text: 'test' },
    });
    expect(() => JSON.stringify(result)).not.toThrow();
  });

  test('handleUiDelete returns { deleted: string }', () => {
    const result = handleUiDelete(makeCtx(), {
      app_name: APP_NAME,
      node_id: 'txt-title',
    });
    expect(result).toHaveProperty('deleted', 'txt-title');
  });

  test('handlePagesList returns a plain object', () => {
    const result = handlePagesList(makeCtx(), { app_name: APP_NAME });
    expect(() => JSON.stringify(result)).not.toThrow();
    expect(result.pages).toBeArray();
  });

  test('handlePagesAdd returns a plain object', () => {
    writePagesJson({ pages: [] });
    const result = handlePagesAdd(makeCtx(), { app_name: APP_NAME, path: 'test-page', title: 'Test' });
    expect(() => JSON.stringify(result)).not.toThrow();
  });
});
