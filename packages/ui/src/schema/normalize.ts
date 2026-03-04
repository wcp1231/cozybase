/**
 * Normalization for pages.json.
 *
 * Primary job: ensure every component node has a stable `id`.
 * Called before validation and before any write operation.
 */

import { generateNodeId } from './id';

/**
 * Normalize a raw pages.json object:
 * - Recursively adds `id` to any component node that is missing one
 * - Does NOT validate structure (call validatePagesJson for that)
 *
 * Returns the normalized object (mutates in place for performance).
 */
export function normalizePagesJson(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const data = raw as Record<string, unknown>;

  if (Array.isArray(data.pages)) {
    for (const page of data.pages) {
      normalizePage(page);
    }
  }

  if (data.components && typeof data.components === 'object') {
    for (const comp of Object.values(data.components as Record<string, unknown>)) {
      normalizeCustomComponent(comp);
    }
  }

  return data;
}

function normalizePage(page: unknown): void {
  if (!page || typeof page !== 'object') return;
  const p = page as Record<string, unknown>;
  if (Array.isArray(p.body)) {
    for (const node of p.body) {
      normalizeNode(node);
    }
  }
}

function normalizeCustomComponent(comp: unknown): void {
  if (!comp || typeof comp !== 'object') return;
  const c = comp as Record<string, unknown>;
  if (c.body) normalizeNode(c.body);
}

/**
 * Recursively ensure a component node has an `id`.
 * Also recurses into known child fields.
 */
export function normalizeNode(node: unknown): void {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return;
  const n = node as Record<string, unknown>;

  if (!n.type || typeof n.type !== 'string') return;

  // Auto-generate id if missing
  if (!n.id || typeof n.id !== 'string') {
    n.id = generateNodeId(n.type);
  }

  // Recurse into known child container fields
  recurseChildren(n, 'children');
  recurseChildren(n, 'body');

  // tabs.items[].body
  if (Array.isArray(n.items)) {
    for (const item of n.items) {
      if (item && typeof item === 'object') {
        const tabItem = item as Record<string, unknown>;
        if (Array.isArray(tabItem.body)) {
          for (const child of tabItem.body) {
            normalizeNode(child);
          }
        }
      }
    }
  }

  // list.itemRender
  if (n.itemRender) normalizeNode(n.itemRender);

  // table.columns[].render
  if (Array.isArray(n.columns)) {
    for (const col of n.columns) {
      if (col && typeof col === 'object') {
        const c = col as Record<string, unknown>;
        if (c.render) normalizeNode(c.render);
      }
    }
  }

  // Actions may contain dialog bodies
  normalizeActions(n.action);
  normalizeActions(n.onSuccess);
  normalizeActions(n.onError);

  if (Array.isArray(n.rowActions)) {
    for (const ra of n.rowActions) {
      if (ra && typeof ra === 'object') {
        normalizeActions((ra as Record<string, unknown>).action);
      }
    }
  }
}

function recurseChildren(node: Record<string, unknown>, field: string): void {
  if (Array.isArray(node[field])) {
    for (const child of node[field] as unknown[]) {
      normalizeNode(child);
    }
  }
}

function normalizeActions(actions: unknown): void {
  if (!actions) return;
  const list = Array.isArray(actions) ? actions : [actions];
  for (const action of list) {
    if (!action || typeof action !== 'object') continue;
    const a = action as Record<string, unknown>;
    // dialog action has a body component
    if (a.type === 'dialog' && a.body) {
      normalizeNode(a.body);
    }
    // api/confirm actions may have onSuccess/onError/onConfirm/onCancel
    normalizeActions(a.onSuccess);
    normalizeActions(a.onError);
    normalizeActions(a.onConfirm);
    normalizeActions(a.onCancel);
  }
}
