/**
 * Unit tests for validatePagesJson
 *
 * Covers:
 *  - Valid documents pass
 *  - Builtin components with missing required fields fail (not swallowed by custom fallback)
 *  - Custom (non-builtin) component instances are allowed
 *  - Duplicate component IDs within a page → semantic error
 *  - Duplicate component IDs across pages → semantic error
 *  - Invalid reload.target → semantic error
 *  - Missing required fields (id) → Zod error
 */

import { describe, expect, it } from 'bun:test';
import { validatePagesJson } from '../validate';

// ---- Correct fixtures using the actual field names from the Zod schema ----

function makeText(id: string, text = 'hello') {
  return { type: 'text', id, text };
}

function makeButton(id: string, label = 'Click', targetId?: string) {
  return {
    type: 'button',
    id,
    label,
    action: targetId
      ? [{ type: 'reload', target: targetId }]
      : [{ type: 'link', url: '/home' }],
  };
}

function makeRow(id: string, children: unknown[] = []) {
  return { type: 'row', id, children };
}

function makePage(path: string, body: unknown[] = []) {
  return { path, title: path, body };
}

function makeDoc(pages: unknown[]) {
  return { pages };
}

// ============================================================

describe('validatePagesJson — valid documents', () => {
  it('accepts a minimal empty pages document', () => {
    const result = validatePagesJson(makeDoc([]));
    expect(result.ok).toBe(true);
  });

  it('accepts a page with a valid text node', () => {
    const result = validatePagesJson(makeDoc([makePage('page-home', [makeText('text-1')])]));
    expect(result.ok).toBe(true);
  });

  it('accepts a button with a valid reload.target', () => {
    const doc = makeDoc([
      {
        path: 'page-home',
        title: 'Home',
        body: [
          makeText('text-t1', 'Title'),
          makeButton('btn-1', 'Reload', 'text-t1'),
        ],
      },
    ]);
    expect(validatePagesJson(doc).ok).toBe(true);
  });

  it('returns typed PagesJson on success', () => {
    const doc = makeDoc([makePage('page-home', [makeText('text-abc12')])]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.pages).toHaveLength(1);
      expect(result.data.pages[0].path).toBe('page-home');
    }
  });
});

describe('validatePagesJson — builtin components with wrong/missing required fields', () => {
  it('rejects a text node using "content" instead of "text"', () => {
    const doc = makeDoc([
      makePage('page-home', [
        { type: 'text', id: 't1', content: 'wrong field name' },
      ]),
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
  });

  it('rejects a button missing the required "action" field', () => {
    const doc = makeDoc([
      makePage('page-home', [
        { type: 'button', id: 'b1', label: 'Click' }, // no action
      ]),
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const msg = result.errors.map((e) => e.message).join(' ');
      expect(msg).toMatch(/builtin component type/);
    }
  });
});

describe('validatePagesJson — custom component instances', () => {
  it('accepts a node with a non-builtin type (custom component)', () => {
    const doc = makeDoc([
      makePage('page-home', [
        { type: 'my-custom-widget', id: 'widget-1', props: { count: 3 } },
      ]),
    ]);
    expect(validatePagesJson(doc).ok).toBe(true);
  });

  it('rejects a node missing both id and type', () => {
    const doc = makeDoc([
      makePage('page-home', [{ label: 'no type or id' }]),
    ]);
    expect(validatePagesJson(doc).ok).toBe(false);
  });
});

describe('validatePagesJson — duplicate IDs (within page)', () => {
  it('rejects two nodes with the same id in the same page', () => {
    const doc = makeDoc([
      makePage('page-home', [
        makeText('dup-id', 'First'),
        makeText('dup-id', 'Second'),
      ]),
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('Duplicate component id'))).toBe(true);
    }
  });

  it('rejects a duplicate id nested inside a container', () => {
    const doc = makeDoc([
      makePage('page-home', [
        makeText('text-outer', 'Outer'),
        makeRow('row-1', [makeText('text-outer', 'Inner duplicate')]),
      ]),
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('Duplicate component id'))).toBe(true);
    }
  });
});

describe('validatePagesJson — duplicate IDs (across pages)', () => {
  it('rejects the same id used in two different pages', () => {
    const doc = makeDoc([
      makePage('page-a', [makeText('shared-id', 'Page A')]),
      makePage('page-b', [makeText('shared-id', 'Page B')]),
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('already used in another page'))).toBe(true);
    }
  });
});

describe('validatePagesJson — invalid reload.target', () => {
  it('rejects reload.target that does not match any node id', () => {
    const doc = makeDoc([
      {
        path: 'page-home',
        title: 'Home',
        body: [
          {
            type: 'button',
            id: 'btn-1',
            label: 'Go',
            action: [{ type: 'reload', target: 'nonexistent-id' }],
          },
        ],
      },
    ]);
    const result = validatePagesJson(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('reload.target'))).toBe(true);
    }
  });
});

describe('validatePagesJson — missing required fields', () => {
  it('rejects a node missing the id field', () => {
    const doc = makeDoc([
      makePage('page-home', [{ type: 'text', text: 'no id here' }]),
    ]);
    expect(validatePagesJson(doc).ok).toBe(false);
  });

  it('rejects a document missing the pages array', () => {
    expect(validatePagesJson({}).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validatePagesJson(null).ok).toBe(false);
    expect(validatePagesJson('string').ok).toBe(false);
    expect(validatePagesJson(42).ok).toBe(false);
  });

  it('rejects an invalid page path pattern', () => {
    const result = validatePagesJson(makeDoc([{ path: 'orders//refund', title: 'Bad', body: [] }]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.path.includes('.path'))).toBe(true);
    }
  });

  it('rejects duplicate page paths', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'orders', title: 'Orders', body: [] },
      { path: 'orders', title: 'Orders 2', body: [] },
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('duplicated'))).toBe(true);
    }
  });

  it('rejects a parameterized detail page when its static parent page is missing', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'home', title: 'Home', body: [] },
      { path: 'tasks/:taskId', title: 'Task Detail', body: [] },
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('must have at least one ancestor page'))).toBe(true);
    }
  });

  it('accepts a parameterized detail page when its static parent page exists', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'home', title: 'Home', body: [] },
      { path: 'tasks', title: 'Tasks', body: [] },
      { path: 'tasks/:taskId', title: 'Task Detail', body: [] },
    ]));
    expect(result.ok).toBe(true);
  });

  it('accepts a nested parameterized detail page when an earlier ancestor page can match the breadcrumb chain', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'users', title: 'Users', body: [] },
      { path: 'users/:userId', title: 'User Detail', body: [] },
      { path: 'users/:userId/tasks/:taskId', title: 'Task Detail', body: [] },
    ]));
    expect(result.ok).toBe(true);
  });

  it('accepts a deeper detail page when each parameterized branch has a navigable ancestor page', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'users', title: 'Users', body: [] },
      { path: 'users/:userId', title: 'User Detail', body: [] },
      { path: 'users/:userId/tasks', title: 'User Tasks', body: [] },
      { path: 'users/:userId/tasks/:taskId', title: 'Task Detail', body: [] },
    ]));
    expect(result.ok).toBe(true);
  });

  it('rejects a parameterized detail page when no existing page can structurally match any breadcrumb ancestor', () => {
    const result = validatePagesJson(makeDoc([
      { path: 'home', title: 'Home', body: [] },
      { path: 'reports/:reportId/charts/:chartId', title: 'Chart Detail', body: [] },
    ]));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.message.includes('must have at least one ancestor page'))).toBe(true);
    }
  });
});
