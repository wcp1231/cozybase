import type { PageSchema } from '@cozybase/ui';

export interface PageTreeNode {
  key: string;
  path: string;
  segment: string;
  page: PageSchema | null;
  children: PageTreeNode[];
}

interface MutablePageTreeNode extends Omit<PageTreeNode, 'children'> {
  children: MutablePageTreeNode[];
  childMap: Map<string, MutablePageTreeNode>;
}

export function buildPageTree(pages: PageSchema[]): PageTreeNode[] {
  const root: MutablePageTreeNode = {
    key: '__root__',
    path: '',
    segment: '',
    page: null,
    children: [],
    childMap: new Map(),
  };

  for (const page of pages) {
    const segments = page.path.split('/').filter(Boolean);
    let parent = root;

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]!;
      let node = parent.childMap.get(segment);

      if (!node) {
        const path = segments.slice(0, index + 1).join('/');
        node = {
          key: path,
          path,
          segment,
          page: null,
          children: [],
          childMap: new Map(),
        };
        parent.childMap.set(segment, node);
        parent.children.push(node);
      }

      parent = node;
    }

    parent.page = page;
  }

  return root.children.map(stripChildMap);
}

function stripChildMap(node: MutablePageTreeNode): PageTreeNode {
  return {
    key: node.key,
    path: node.path,
    segment: node.segment,
    page: node.page,
    children: node.children.map(stripChildMap),
  };
}
