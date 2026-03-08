import {
  findNodeById,
  getChildrenArray,
  type ComponentSchema,
  type PageSchema,
  type PagesJson,
} from '@cozybase/ui';

export function findPageByPath(data: PagesJson, pagePath: string): PageSchema | null {
  return data.pages.find((page) => page.path === pagePath) ?? null;
}

export function canInsertIntoNode(node: ComponentSchema): boolean {
  if (getChildrenArray(node)) return true;

  if (node.type === 'tabs') {
    const items = (node as { items?: Array<{ body?: ComponentSchema[] }> }).items;
    return Array.isArray(items) && items.length > 0 && Array.isArray(items[0]?.body);
  }

  return false;
}

export function canDeleteNode(data: PagesJson, nodeId: string): boolean {
  const location = findNodeById(data, nodeId);
  if (!location) return false;
  if (location.slotMutator) {
    return Boolean(location.slotMutator.remove);
  }
  return true;
}

export function insertComponentAtSelection(
  data: PagesJson,
  pagePath: string,
  selectedNodeId: string | null,
  newNode: ComponentSchema,
): string {
  if (!selectedNodeId) {
    const page = findPageByPath(data, pagePath);
    if (!page) throw new Error(`Page not found: ${pagePath}`);
    page.body.push(newNode);
    return newNode.id;
  }

  const location = findNodeById(data, selectedNodeId);
  if (!location) throw new Error(`Node not found: ${selectedNodeId}`);

  const directChildren = getChildrenArray(location.node);
  if (directChildren) {
    directChildren.push(newNode);
    return newNode.id;
  }

  if (location.node.type === 'tabs') {
    const items = (location.node as { items?: Array<{ body?: ComponentSchema[] }> }).items;
    if (Array.isArray(items) && items.length > 0 && Array.isArray(items[0]?.body)) {
      items[0].body!.push(newNode);
      return newNode.id;
    }
  }

  if (!location.slotMutator) {
    location.siblings.splice(location.index + 1, 0, newNode);
    return newNode.id;
  }

  const parentNodeId = (location.parent as { id?: string }).id;
  if (!parentNodeId) {
    throw new Error(`Cannot insert sibling for singleton slot node: ${selectedNodeId}`);
  }

  const parentLocation = findNodeById(data, parentNodeId);
  if (!parentLocation) {
    throw new Error(`Parent node not found for singleton slot node: ${selectedNodeId}`);
  }

  parentLocation.siblings.splice(parentLocation.index + 1, 0, newNode);
  return newNode.id;
}

export function deleteNodeById(data: PagesJson, nodeId: string): void {
  const location = findNodeById(data, nodeId);
  if (!location) throw new Error(`Node not found: ${nodeId}`);

  if (location.slotMutator?.remove) {
    location.slotMutator.remove();
    return;
  }

  if (location.slotMutator && !location.slotMutator.remove) {
    throw new Error(`Node cannot be deleted from required slot: ${nodeId}`);
  }

  location.siblings.splice(location.index, 1);
}

export function moveNodeBeforeSibling(
  data: PagesJson,
  activeNodeId: string,
  overNodeId: string,
): boolean {
  if (activeNodeId === overNodeId) return false;

  const activeLocation = findNodeById(data, activeNodeId);
  const overLocation = findNodeById(data, overNodeId);
  if (!activeLocation || !overLocation) return false;
  if (activeLocation.siblings !== overLocation.siblings) return false;
  if (activeLocation.siblings.length < 2) return false;

  const siblings = activeLocation.siblings;
  const [node] = siblings.splice(activeLocation.index, 1);
  const nextIndex = activeLocation.index < overLocation.index ? overLocation.index - 1 : overLocation.index;
  siblings.splice(nextIndex, 0, node);
  return true;
}

export function moveNodeBySortablePosition(
  data: PagesJson,
  sourceGroupId: string,
  targetGroupId: string,
  fromIndex: number,
  toIndex: number,
): boolean {
  if (sourceGroupId !== targetGroupId) return false;
  if (fromIndex === toIndex) return false;

  const siblings = resolveSortableGroupChildren(data, sourceGroupId);
  if (!siblings) return false;
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= siblings.length || toIndex >= siblings.length) return false;

  const [node] = siblings.splice(fromIndex, 1);
  siblings.splice(toIndex, 0, node);
  return true;
}

function resolveSortableGroupChildren(data: PagesJson, groupId: string): ComponentSchema[] | null {
  if (groupId.startsWith('page:')) {
    const pagePath = groupId.slice('page:'.length);
    return findPageByPath(data, pagePath)?.body ?? null;
  }

  if (groupId.startsWith('slot:')) {
    const parts = groupId.split(':');
    if (parts.length >= 4 && parts[2] === 'tab') {
      const parentId = decodeURIComponent(parts[1]!);
      const tabIndex = Number(parts[3]);
      if (!Number.isInteger(tabIndex)) return null;

      const location = findNodeById(data, parentId);
      if (!location) return null;

      const items = (location.node as { items?: Array<{ body?: ComponentSchema[] }> }).items;
      if (!Array.isArray(items)) return null;
      return Array.isArray(items[tabIndex]?.body) ? items[tabIndex]!.body! : null;
    }
  }

  const location = findNodeById(data, groupId);
  if (!location) return null;
  return getChildrenArray(location.node);
}
