/**
 * Validation for pages.json.
 *
 * Three layers:
 *   Layer 1+2: Zod schema (structure + required fields per component type)
 *   Layer 3:   Semantic rules (ID uniqueness, reload.target references)
 */

import { pagesJsonSchema } from './zod';
import type { PagesJson } from './types';

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: true;
  data: PagesJson;
}

export interface ValidationFailure {
  ok: false;
  errors: ValidationError[];
}

export type ValidationOutcome = ValidationResult | ValidationFailure;

/**
 * Validate a raw unknown value as a PagesJson document.
 *
 * Runs Layer 1+2 (Zod) then Layer 3 (semantic checks).
 * Returns the parsed + typed PagesJson on success, or a list of errors on failure.
 */
export function validatePagesJson(data: unknown): ValidationOutcome {
  // Layer 1+2: Zod structural validation
  const result = pagesJsonSchema.safeParse(data);
  if (!result.success) {
    const errors: ValidationError[] = result.error.errors.map((e) => ({
      path: e.path.join('.') || '(root)',
      message: e.message,
    }));
    return { ok: false, errors };
  }

  // Layer 3: Semantic validation
  const semanticErrors = runSemanticChecks(result.data);
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }

  return { ok: true, data: result.data };
}

// ============================================================
// Layer 3: Semantic checks
// ============================================================

function runSemanticChecks(pages: PagesJson): ValidationError[] {
  const errors: ValidationError[] = [];

  // Global ID uniqueness across all pages (node_id lookups are document-wide)
  const globalIds = new Set<string>();
  for (const page of pages.pages) {
    const collector = new PageSemanticChecker(page.id);
    collector.collectBodyIds(page.body, `pages[${page.id}].body`);
    errors.push(...collector.checkReferences(page.body, `pages[${page.id}].body`));
    errors.push(...collector.duplicateErrors);

    // Check for cross-page duplicates
    for (const id of collector.collectedIds) {
      if (globalIds.has(id)) {
        errors.push({
          path: `pages[${page.id}]`,
          message: `Component id "${id}" is already used in another page — ids must be unique across the entire document`,
        });
      } else {
        globalIds.add(id);
      }
    }
  }

  return errors;
}

class PageSemanticChecker {
  /** All component IDs collected in this page */
  private allIds = new Set<string>();
  /** Duplicate IDs found during collection */
  duplicateErrors: ValidationError[] = [];
  /** All IDs collected (exposed for cross-page deduplication) */
  get collectedIds(): ReadonlySet<string> { return this.allIds; }

  constructor(private pageId: string) {}

  /** First pass: collect all IDs and detect duplicates */
  collectBodyIds(nodes: unknown[], path: string): void {
    for (let i = 0; i < nodes.length; i++) {
      this.collectNodeId(nodes[i], `${path}[${i}]`);
    }
  }

  private collectNodeId(node: unknown, path: string): void {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;

    if (typeof n.id === 'string') {
      if (this.allIds.has(n.id)) {
        this.duplicateErrors.push({
          path,
          message: `Duplicate component id "${n.id}" in page "${this.pageId}"`,
        });
      } else {
        this.allIds.add(n.id);
      }
    }

    // Recurse into child nodes
    this.collectFromChildren(n, path);
  }

  private collectFromChildren(n: Record<string, unknown>, path: string): void {
    if (Array.isArray(n.children)) {
      this.collectBodyIds(n.children, `${path}.children`);
    }
    if (Array.isArray(n.body)) {
      this.collectBodyIds(n.body, `${path}.body`);
    }
    if (n.itemRender) {
      this.collectNodeId(n.itemRender, `${path}.itemRender`);
    }
    if (Array.isArray(n.items)) {
      for (let i = 0; i < n.items.length; i++) {
        const item = n.items[i] as Record<string, unknown>;
        if (Array.isArray(item?.body)) {
          this.collectBodyIds(item.body, `${path}.items[${i}].body`);
        }
      }
    }
    if (Array.isArray(n.columns)) {
      for (let i = 0; i < n.columns.length; i++) {
        const col = n.columns[i] as Record<string, unknown>;
        if (col?.render) this.collectNodeId(col.render, `${path}.columns[${i}].render`);
      }
    }
    // Recurse into dialog action bodies
    this.collectFromActions(n.action, `${path}.action`);
    this.collectFromActions(n.onSuccess, `${path}.onSuccess`);
    this.collectFromActions(n.onError, `${path}.onError`);
    if (Array.isArray(n.rowActions)) {
      for (let i = 0; i < n.rowActions.length; i++) {
        const ra = n.rowActions[i] as Record<string, unknown>;
        this.collectFromActions(ra?.action, `${path}.rowActions[${i}].action`);
      }
    }
  }

  private collectFromActions(actions: unknown, path: string): void {
    if (!actions) return;
    const list = Array.isArray(actions) ? actions : [actions];
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Record<string, unknown>;
      if (!a) continue;
      if (a.type === 'dialog' && a.body) {
        this.collectNodeId(a.body, `${path}[${i}].body`);
      }
      this.collectFromActions(a.onSuccess, `${path}[${i}].onSuccess`);
      this.collectFromActions(a.onError, `${path}[${i}].onError`);
      this.collectFromActions(a.onConfirm, `${path}[${i}].onConfirm`);
      this.collectFromActions(a.onCancel, `${path}[${i}].onCancel`);
    }
  }

  /** Second pass: check reload.target references */
  checkReferences(nodes: unknown[], path: string): ValidationError[] {
    const errors: ValidationError[] = [];
    this.checkNodesRefs(nodes, path, errors);
    return errors;
  }

  private checkNodesRefs(nodes: unknown[], path: string, errors: ValidationError[]): void {
    for (let i = 0; i < nodes.length; i++) {
      this.checkNodeRefs(nodes[i], `${path}[${i}]`, errors);
    }
  }

  private checkNodeRefs(node: unknown, path: string, errors: ValidationError[]): void {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const n = node as Record<string, unknown>;

    // Check children recursively
    if (Array.isArray(n.children)) this.checkNodesRefs(n.children, `${path}.children`, errors);
    if (Array.isArray(n.body)) this.checkNodesRefs(n.body, `${path}.body`, errors);
    if (n.itemRender) this.checkNodeRefs(n.itemRender, `${path}.itemRender`, errors);

    if (Array.isArray(n.items)) {
      for (let i = 0; i < n.items.length; i++) {
        const item = n.items[i] as Record<string, unknown>;
        if (Array.isArray(item?.body)) {
          this.checkNodesRefs(item.body, `${path}.items[${i}].body`, errors);
        }
      }
    }
    if (Array.isArray(n.columns)) {
      for (let i = 0; i < n.columns.length; i++) {
        const col = n.columns[i] as Record<string, unknown>;
        if (col?.render) this.checkNodeRefs(col.render, `${path}.columns[${i}].render`, errors);
      }
    }

    // Check actions for reload.target validity
    this.checkActionRefs(n.action, `${path}.action`, errors);
    this.checkActionRefs(n.onSuccess, `${path}.onSuccess`, errors);
    this.checkActionRefs(n.onError, `${path}.onError`, errors);
    if (Array.isArray(n.rowActions)) {
      for (let i = 0; i < n.rowActions.length; i++) {
        const ra = n.rowActions[i] as Record<string, unknown>;
        this.checkActionRefs(ra?.action, `${path}.rowActions[${i}].action`, errors);
      }
    }
  }

  private checkActionRefs(actions: unknown, path: string, errors: ValidationError[]): void {
    if (!actions) return;
    const list = Array.isArray(actions) ? actions : [actions];
    for (let i = 0; i < list.length; i++) {
      const a = list[i] as Record<string, unknown>;
      if (!a) continue;

      if (a.type === 'reload' && typeof a.target === 'string') {
        if (!this.allIds.has(a.target)) {
          errors.push({
            path: `${path}[${i}].target`,
            message: `reload.target "${a.target}" does not match any component id in page "${this.pageId}"`,
          });
        }
      }

      if (a.type === 'dialog' && a.body) {
        this.checkNodeRefs(a.body, `${path}[${i}].body`, errors);
      }
      this.checkActionRefs(a.onSuccess, `${path}[${i}].onSuccess`, errors);
      this.checkActionRefs(a.onError, `${path}[${i}].onError`, errors);
      this.checkActionRefs(a.onConfirm, `${path}[${i}].onConfirm`, errors);
      this.checkActionRefs(a.onCancel, `${path}[${i}].onCancel`, errors);
    }
  }
}
