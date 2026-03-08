import type { ComponentSchema, PageSchema, PagesJson } from './types';

export interface SlotMutator {
  set: (newNode: ComponentSchema) => void;
  remove?: () => void;
}

export interface ChildVisitContext {
  parent: ComponentSchema | PageSchema;
  slotMutator?: SlotMutator;
}

export type ChildVisitor = (
  child: ComponentSchema,
  siblings: ComponentSchema[],
  index: number,
  context: ChildVisitContext,
) => void;

export interface NodeLocation extends ChildVisitContext {
  node: ComponentSchema;
  siblings: ComponentSchema[];
  index: number;
  page: PageSchema;
}

export function visitChildComponents(node: ComponentSchema, visitor: ChildVisitor): void {
  const n = node as Record<string, unknown>;

  visitComponentArray(n.children, node, visitor);
  visitComponentArray(n.body, node, visitor);

  if (Array.isArray(n.items)) {
    for (const tabItem of n.items as Array<Record<string, unknown>>) {
      visitComponentArray(tabItem.body, node, visitor);
    }
  }

  if (n.itemRender && typeof n.itemRender === 'object' && !Array.isArray(n.itemRender)) {
    const wrapper = n.itemRender as ComponentSchema;
    visitor(wrapper, [wrapper], 0, {
      parent: node,
      slotMutator: {
        set: (newNode) => { n.itemRender = newNode; },
      },
    });
  }

  if (Array.isArray(n.columns)) {
    for (const col of n.columns as Array<Record<string, unknown>>) {
      if (col.render && typeof col.render === 'object' && !Array.isArray(col.render)) {
        const wrapper = col.render as ComponentSchema;
        visitor(wrapper, [wrapper], 0, {
          parent: node,
          slotMutator: {
            set: (newNode) => { col.render = newNode; },
            remove: () => { delete col.render; },
          },
        });
      }
    }
  }

  visitActionComponentSlots(n.action, node, visitor);
  visitActionComponentSlots(n.onSuccess, node, visitor);
  visitActionComponentSlots(n.onError, node, visitor);

  if (Array.isArray(n.rowActions)) {
    for (const rowAction of n.rowActions as Array<Record<string, unknown>>) {
      visitActionComponentSlots(rowAction.action, node, visitor);
    }
  }
}

export function findNodeById(data: PagesJson, nodeId: string): NodeLocation | null {
  for (const page of data.pages) {
    const found = findInArray(page.body, page, nodeId);
    if (found) return found;
  }
  return null;
}

export function findParentOfNode(data: PagesJson, nodeId: string): PageSchema | ComponentSchema | null {
  return findNodeById(data, nodeId)?.parent ?? null;
}

export function getChildrenArray(node: ComponentSchema | PageSchema): ComponentSchema[] | null {
  const n = node as Record<string, unknown>;
  if (Array.isArray(n.children)) return n.children as ComponentSchema[];
  if (Array.isArray(n.body)) return n.body as ComponentSchema[];
  return null;
}

export function subtreeContainsId(node: ComponentSchema, targetId: string): boolean {
  let found = false;
  visitChildComponents(node, (child) => {
    if (found) return;
    if ((child as { id?: string }).id === targetId) {
      found = true;
      return;
    }
    if (subtreeContainsId(child, targetId)) {
      found = true;
    }
  });
  return found;
}

export function isAncestorOf(node: ComponentSchema, targetId: string): boolean {
  return (node as { id?: string }).id === targetId || subtreeContainsId(node, targetId);
}

function findInArray(
  arr: ComponentSchema[],
  page: PageSchema,
  nodeId: string,
): NodeLocation | null {
  for (let index = 0; index < arr.length; index++) {
    const node = arr[index];
    if ((node as { id?: string }).id === nodeId) {
      return {
        node,
        siblings: arr,
        index,
        parent: page,
        page,
      };
    }
    const found = findInChildSlots(node, page, nodeId);
    if (found) return found;
  }
  return null;
}

function findInChildSlots(
  node: ComponentSchema,
  page: PageSchema,
  nodeId: string,
): NodeLocation | null {
  let result: NodeLocation | null = null;
  visitChildComponents(node, (child, siblings, index, context) => {
    if (result) return;
    if ((child as { id?: string }).id === nodeId) {
      result = {
        node: child,
        siblings,
        index,
        parent: context.parent,
        page,
        slotMutator: context.slotMutator,
      };
      return;
    }

    const deeper = findInChildSlots(child, page, nodeId);
    if (deeper) result = deeper;
  });
  return result;
}

function visitComponentArray(
  value: unknown,
  parent: ComponentSchema,
  visitor: ChildVisitor,
): void {
  if (!Array.isArray(value)) return;
  const arr = value as ComponentSchema[];
  for (let index = 0; index < arr.length; index++) {
    visitor(arr[index], arr, index, { parent });
  }
}

function visitActionComponentSlots(
  actions: unknown,
  parent: ComponentSchema,
  visitor: ChildVisitor,
): void {
  if (!actions) return;
  const list = Array.isArray(actions) ? actions : [actions];
  for (const action of list) {
    if (!action || typeof action !== 'object') continue;
    const a = action as Record<string, unknown>;
    if (a.type === 'dialog' && a.body && typeof a.body === 'object' && !Array.isArray(a.body)) {
      const wrapper = a.body as ComponentSchema;
      visitor(wrapper, [wrapper], 0, {
        parent,
        slotMutator: {
          set: (newNode) => { a.body = newNode; },
        },
      });
    }
    visitActionComponentSlots(a.onSuccess, parent, visitor);
    visitActionComponentSlots(a.onError, parent, visitor);
    visitActionComponentSlots(a.onConfirm, parent, visitor);
    visitActionComponentSlots(a.onCancel, parent, visitor);
  }
}
