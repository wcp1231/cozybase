// DOM inspection for agent UI inspector — ported from runtime/src/modules/ui/bridge.ts
// Pure DOM traversal, no messaging. Used by BridgeClient to inspect SchemaRenderer output.

export interface InspectNode {
  schemaId: string;
  type: string;
  text?: string;
  visible: boolean;
  data?: {
    rows?: number;
    columns?: string[];
    items?: unknown[];
  };
  form?: {
    fields?: string[];
    values?: Record<string, unknown>;
  };
  actions?: string[];
  state?: {
    loading?: boolean;
    error?: string;
    disabled?: boolean;
  };
  children?: InspectNode[];
}

export interface InspectResult {
  page: { path: string; title: string };
  tree: InspectNode[];
}

const TEXT_TYPES = new Set(['heading', 'text', 'button', 'tag', 'stat', 'link', 'alert']);

function findDirectSchemaChildren(parent: Element): Element[] {
  const all = parent.querySelectorAll('[data-schema-id]');
  const isSchemaElement = parent.hasAttribute('data-schema-id');
  const direct: Element[] = [];

  for (const el of all) {
    const closestSchemaParent = el.parentElement?.closest('[data-schema-id]');
    if (isSchemaElement ? closestSchemaParent === parent : !closestSchemaParent) {
      direct.push(el);
    }
  }

  return direct;
}

function extractTableData(el: Element): InspectNode['data'] | undefined {
  const table = el.querySelector('table');
  if (!table) return undefined;

  const headers = Array.from(table.querySelectorAll('th')).map(
    (th) => th.textContent?.trim() || '',
  );
  const rows = Array.from(table.querySelectorAll('tbody tr'));
  const items = rows.slice(0, 5).map((row) => {
    const cells = Array.from(row.querySelectorAll('td'));
    const rowData: Record<string, string> = {};
    cells.forEach((cell, i) => {
      rowData[headers[i] || `col${i}`] = cell.textContent?.trim() || '';
    });
    return rowData;
  });

  return { columns: headers, rows: rows.length, items };
}

function resolveFieldName(el: Element): string {
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return ariaLabel;

  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return placeholder;

  const id = el.getAttribute('id');
  if (id) {
    const label = el.closest('form')?.querySelector(`label[for="${id}"]`);
    if (label?.textContent) return label.textContent.trim();
  }

  let parent = el.parentElement;
  for (let i = 0; i < 3 && parent; i++) {
    const label = parent.querySelector('label');
    if (label?.textContent && parent.querySelectorAll('input, textarea, select, button[role]').length <= 1) {
      return label.textContent.trim();
    }
    parent = parent.parentElement;
  }

  return '';
}

function extractFormData(el: Element): InspectNode['form'] | undefined {
  const form = el.querySelector('form');
  if (!form) return undefined;

  const fields: string[] = [];
  const values: Record<string, unknown> = {};

  for (const input of form.querySelectorAll('input, textarea')) {
    const name = resolveFieldName(input);
    if (!name) continue;
    fields.push(name);
    if (input instanceof HTMLInputElement) {
      values[name] = input.type === 'checkbox' ? input.checked : input.value;
    } else if (input instanceof HTMLTextAreaElement) {
      values[name] = input.value;
    }
  }

  for (const sel of form.querySelectorAll('select')) {
    const name = resolveFieldName(sel);
    if (!name) continue;
    fields.push(name);
    if (sel instanceof HTMLSelectElement) {
      values[name] = sel.value;
    }
  }

  for (const trigger of form.querySelectorAll('button[role="combobox"]')) {
    const name = resolveFieldName(trigger);
    if (!name) continue;
    if (!fields.includes(name)) fields.push(name);
    values[name] = trigger.textContent?.trim() || '';
  }

  for (const cb of form.querySelectorAll('button[role="checkbox"]')) {
    const name = resolveFieldName(cb);
    if (!name) continue;
    if (!fields.includes(name)) fields.push(name);
    values[name] = cb.getAttribute('data-state') === 'checked';
  }

  for (const sw of form.querySelectorAll('button[role="switch"]')) {
    const name = resolveFieldName(sw);
    if (!name) continue;
    if (!fields.includes(name)) fields.push(name);
    values[name] = sw.getAttribute('data-state') === 'checked';
  }

  return fields.length > 0 ? { fields, values } : undefined;
}

function extractState(el: Element): InspectNode['state'] | undefined {
  const state: NonNullable<InspectNode['state']> = {};

  if (el.querySelector('.animate-spin') || el.querySelector('.animate-pulse')) {
    state.loading = true;
  }

  if (el.querySelector('[disabled]')) {
    state.disabled = true;
  }

  const errorEl = el.querySelector('[class*="error-text"], [class*="danger"]');
  if (errorEl?.textContent) {
    state.error = errorEl.textContent.trim();
  }

  return Object.keys(state).length > 0 ? state : undefined;
}

function extractActions(el: Element): string[] | undefined {
  const buttons = Array.from(el.querySelectorAll('button'));
  const directButtons = buttons.filter(
    (btn) => btn.closest('[data-schema-id]') === el,
  );
  if (directButtons.length === 0) return undefined;

  const labels = directButtons
    .map((btn) => btn.textContent?.trim() || '')
    .filter(Boolean);
  return labels.length > 0 ? labels : undefined;
}

function inspectElement(el: Element, depth: number): InspectNode {
  const schemaId = el.getAttribute('data-schema-id') || '';
  const type = el.getAttribute('data-schema-type') || schemaId.replace(/-\d+$/, '');

  const node: InspectNode = {
    schemaId,
    type,
    visible: true,
  };

  if (TEXT_TYPES.has(type)) {
    node.text = el.textContent?.trim() || '';
  }

  if (type === 'table') {
    node.data = extractTableData(el);
  }

  if (type === 'form') {
    node.form = extractFormData(el);
  }

  node.state = extractState(el);

  if (type !== 'button') {
    node.actions = extractActions(el);
  }

  if (depth < 10) {
    const children = findDirectSchemaChildren(el);
    if (children.length > 0) {
      node.children = children.map((child) => inspectElement(child, depth + 1));
    }
  }

  return node;
}

/**
 * Inspect the rendered UI tree starting from a root element.
 * Returns a structured tree of components with their content, data, and state.
 */
export function inspectPage(root: Element, pagePath: string): InspectResult {
  const titleEl = root.querySelector('h1, h2, h3');
  const title = titleEl?.textContent?.trim() || pagePath;

  const topLevel = findDirectSchemaChildren(root);
  const tree = topLevel.map((el) => inspectElement(el, 0));

  return { page: { path: pagePath, title }, tree };
}
