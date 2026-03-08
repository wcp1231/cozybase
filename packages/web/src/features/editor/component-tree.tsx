import { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropProvider } from '@dnd-kit/react';
import { isSortableOperation, useSortable } from '@dnd-kit/react/sortable';
import { getComponentSummary, type ComponentSchema, type PageSchema } from '@cozybase/ui';
import { ChevronRight, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';

interface DialogInfo {
  id: string;
  title: string;
  body: ComponentSchema;
}

interface SortableMeta {
  groupId: string;
  index: number;
}

interface SortableBindings {
  ref: (element: HTMLElement | null) => void;
  isDragging: boolean;
}

interface TreeNodeBase {
  id: string;
  label: string;
  subtitle?: string;
  children: ComponentTreeNode[];
  expandedByDefault?: boolean;
  renderKey?: string;
}

export interface SelectedColumnKey {
  tableId: string;
  colIndex: number;
}

export interface SelectedFieldKey {
  formId: string;
  fieldIndex: number;
}

export interface GroupTreeNode extends TreeNodeBase {
  kind: 'group';
  dialog?: DialogInfo;
}

export interface ComponentItemTreeNode extends TreeNodeBase {
  kind: 'component';
  node: ComponentSchema;
  sortable?: SortableMeta;
}

export interface ColumnTreeNode extends TreeNodeBase {
  kind: 'column';
  tableId: string;
  colIndex: number;
  hasRender: boolean;
  sortable: SortableMeta;
}

export interface FieldTreeNode extends TreeNodeBase {
  kind: 'field';
  formId: string;
  fieldIndex: number;
  sortable: SortableMeta;
}

export type ComponentTreeNode = GroupTreeNode | ComponentItemTreeNode | ColumnTreeNode | FieldTreeNode;

interface ComponentTreeProps {
  page: PageSchema;
  selectedNodeId: string | null;
  selectedColumnKey: SelectedColumnKey | null;
  selectedFieldKey: SelectedFieldKey | null;
  canDeleteNode: (nodeId: string) => boolean;
  onSelect: (nodeId: string) => void;
  onSelectColumn: (key: SelectedColumnKey) => void;
  onSelectField: (key: SelectedFieldKey) => void;
  onDeleteColumn: (tableId: string, colIndex: number) => void;
  onDeleteField: (formId: string, fieldIndex: number) => void;
  onDelete: (nodeId: string) => void;
  onMove: (move: {
    activeNodeId: string;
    sourceGroupId: string;
    targetGroupId: string;
    fromIndex: number;
    toIndex: number;
    overNodeId: string | null;
  }) => void;
  onMoveColumn: (tableId: string, fromIndex: number, toIndex: number) => void;
  onMoveField: (formId: string, fromIndex: number, toIndex: number) => void;
  onOpenDialog?: (dialog: { title: string; body: ComponentSchema }) => void;
}

export function getColumnSelectionId(key: SelectedColumnKey): string {
  return `column:${key.tableId}:${key.colIndex}`;
}

export function getFieldSelectionId(key: SelectedFieldKey): string {
  return `field:${key.formId}:${key.fieldIndex}`;
}

export function buildComponentTree(page: PageSchema): ComponentTreeNode[] {
  return page.body.map((node, index) => buildComponentNode(node, {
    sortable: {
      groupId: `page:${page.path}`,
      index,
    },
  }));
}

export function collectAncestorIds(
  nodes: ComponentTreeNode[],
): {
  ancestorBySelectableId: Map<string, string[]>;
  expandableIds: Set<string>;
} {
  const ancestorBySelectableId = new Map<string, string[]>();
  const expandableIds = new Set<string>();

  const visit = (node: ComponentTreeNode, ancestors: string[]) => {
    if (node.children.length > 0) {
      expandableIds.add(node.id);
    }

    if (node.kind === 'component') {
      ancestorBySelectableId.set(node.node.id, [...ancestors]);
    } else if (node.kind === 'column') {
      ancestorBySelectableId.set(getColumnSelectionId({
        tableId: node.tableId,
        colIndex: node.colIndex,
      }), [...ancestors]);
    } else if (node.kind === 'field') {
      ancestorBySelectableId.set(getFieldSelectionId({
        formId: node.formId,
        fieldIndex: node.fieldIndex,
      }), [...ancestors]);
    }

    const nextAncestors = node.children.length > 0 ? [...ancestors, node.id] : ancestors;
    for (const child of node.children) {
      visit(child, nextAncestors);
    }
  };

  for (const node of nodes) {
    visit(node, []);
  }

  return { ancestorBySelectableId, expandableIds };
}

export function ComponentTree({
  page,
  selectedNodeId,
  selectedColumnKey,
  selectedFieldKey,
  canDeleteNode,
  onSelect,
  onSelectColumn,
  onSelectField,
  onDeleteColumn,
  onDeleteField,
  onDelete,
  onMove,
  onMoveColumn,
  onMoveField,
  onOpenDialog,
}: ComponentTreeProps) {
  const tree = useMemo(() => buildComponentTree(page), [page]);
  const treeSignature = useMemo(() => buildTreeSignature(tree), [tree]);
  const { ancestorBySelectableId, expandableIds } = useMemo(
    () => collectAncestorIds(tree),
    [tree],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const initializedExpandedRef = useRef(false);

  useEffect(() => {
    setExpandedIds((previous) => {
      if (!initializedExpandedRef.current) {
        initializedExpandedRef.current = true;
        return new Set(expandableIds);
      }

      const next = new Set<string>();
      for (const nodeId of previous) {
        if (expandableIds.has(nodeId)) {
          next.add(nodeId);
        }
      }
      return next;
    });
  }, [expandableIds]);

  useEffect(() => {
    const selectedKey = selectedColumnKey
      ? getColumnSelectionId(selectedColumnKey)
      : selectedFieldKey
        ? getFieldSelectionId(selectedFieldKey)
      : selectedNodeId;
    if (!selectedKey) return;

    const ancestors = ancestorBySelectableId.get(selectedKey);
    if (!ancestors || ancestors.length === 0) return;

    setExpandedIds((previous) => {
      const next = new Set(previous);
      let changed = false;
      for (const ancestorId of ancestors) {
        if (!next.has(ancestorId)) {
          next.add(ancestorId);
          changed = true;
        }
      }
      return changed ? next : previous;
    });
  }, [ancestorBySelectableId, selectedColumnKey, selectedFieldKey, selectedNodeId]);

  const toggleExpanded = (nodeId: string) => {
    setExpandedIds((previous) => {
      const next = new Set(previous);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <DragDropProvider
      key={treeSignature}
      onDragEnd={(event) => {
        if (event.canceled) return;
        if (!isSortableOperation(event.operation)) return;

        const sourceId = event.operation.source?.id;
        const targetId = event.operation.target?.id;
        const sourceGroupId = event.operation.source?.initialGroup;
        const targetGroupId = event.operation.source?.group;
        const fromIndex = event.operation.source?.initialIndex;
        const toIndex = event.operation.source?.index;
        if (!sourceId || !sourceGroupId || !targetGroupId) return;
        if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') return;
        if (fromIndex === toIndex && sourceGroupId === targetGroupId) return;

        if (String(sourceGroupId).startsWith('columns:')) {
          const tableId = decodeURIComponent(String(sourceGroupId).slice('columns:'.length));
          onMoveColumn(tableId, fromIndex, toIndex);
          return;
        }

        if (String(sourceGroupId).startsWith('fields:')) {
          const formId = decodeURIComponent(String(sourceGroupId).slice('fields:'.length));
          onMoveField(formId, fromIndex, toIndex);
          return;
        }

        onMove({
          activeNodeId: String(sourceId),
          sourceGroupId: String(sourceGroupId),
          targetGroupId: String(targetGroupId),
          fromIndex,
          toIndex,
          overNodeId: targetId ? String(targetId) : null,
        });
      }}
    >
      <div className="flex flex-col gap-1 px-2 pb-3">
        {tree.map((node) => (
          <TreeBranch
            key={getTreeNodeRenderKey(node)}
            node={node}
            depth={0}
            expandedIds={expandedIds}
            selectedNodeId={selectedNodeId}
            selectedColumnKey={selectedColumnKey}
            selectedFieldKey={selectedFieldKey}
            canDeleteNode={canDeleteNode}
            onToggleExpanded={toggleExpanded}
            onSelect={onSelect}
            onSelectColumn={onSelectColumn}
            onSelectField={onSelectField}
            onDeleteColumn={onDeleteColumn}
            onDeleteField={onDeleteField}
            onDelete={onDelete}
            onOpenDialog={onOpenDialog}
          />
        ))}
      </div>
    </DragDropProvider>
  );
}

function TreeBranch({
  node,
  depth,
  expandedIds,
  selectedNodeId,
  selectedColumnKey,
  selectedFieldKey,
  canDeleteNode,
  onToggleExpanded,
  onSelect,
  onSelectColumn,
  onSelectField,
  onDeleteColumn,
  onDeleteField,
  onDelete,
  onOpenDialog,
}: {
  node: ComponentTreeNode;
  depth: number;
  expandedIds: Set<string>;
  selectedNodeId: string | null;
  selectedColumnKey: SelectedColumnKey | null;
  selectedFieldKey: SelectedFieldKey | null;
  canDeleteNode: (nodeId: string) => boolean;
  onToggleExpanded: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onSelectColumn: (key: SelectedColumnKey) => void;
  onSelectField: (key: SelectedFieldKey) => void;
  onDeleteColumn: (tableId: string, colIndex: number) => void;
  onDeleteField: (formId: string, fieldIndex: number) => void;
  onDelete: (nodeId: string) => void;
  onOpenDialog?: (dialog: { title: string; body: ComponentSchema }) => void;
}) {
  const hasChildren = node.children.length > 0;
  const expanded = hasChildren ? expandedIds.has(node.id) : false;
  const sortableBindings = useTreeNodeSortable(node);

  return (
    <div ref={sortableBindings?.ref}>
      {node.kind === 'component' ? (
        <ComponentRow
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          expanded={expanded}
          selected={selectedNodeId === node.node.id}
          deletable={canDeleteNode(node.node.id)}
          sortableBindings={sortableBindings}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ) : node.kind === 'column' ? (
        <ColumnRow
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          expanded={expanded}
          selected={
            selectedColumnKey?.tableId === node.tableId &&
            selectedColumnKey?.colIndex === node.colIndex
          }
          sortableBindings={sortableBindings}
          onToggleExpanded={onToggleExpanded}
          onSelect={onSelectColumn}
          onDelete={onDeleteColumn}
        />
      ) : node.kind === 'field' ? (
        <FieldRow
          node={node}
          depth={depth}
          selected={
            selectedFieldKey?.formId === node.formId &&
            selectedFieldKey?.fieldIndex === node.fieldIndex
          }
          sortableBindings={sortableBindings}
          onSelect={onSelectField}
          onDelete={onDeleteField}
        />
      ) : (
        <GroupRow
          node={node}
          depth={depth}
          hasChildren={hasChildren}
          expanded={expanded}
          onToggleExpanded={onToggleExpanded}
          onOpenDialog={onOpenDialog}
        />
      )}

      {hasChildren && expanded ? (
        <div className="mt-1 flex flex-col gap-1">
          {node.children.map((child) => (
            <TreeBranch
              key={getTreeNodeRenderKey(child)}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
              selectedNodeId={selectedNodeId}
              selectedColumnKey={selectedColumnKey}
              selectedFieldKey={selectedFieldKey}
              canDeleteNode={canDeleteNode}
              onToggleExpanded={onToggleExpanded}
              onSelect={onSelect}
              onSelectColumn={onSelectColumn}
              onSelectField={onSelectField}
              onDeleteColumn={onDeleteColumn}
              onDeleteField={onDeleteField}
              onDelete={onDelete}
              onOpenDialog={onOpenDialog}
              />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ComponentRow({
  node,
  depth,
  hasChildren,
  expanded,
  selected,
  deletable,
  sortableBindings,
  onToggleExpanded,
  onSelect,
  onDelete,
}: {
  node: ComponentItemTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  deletable: boolean;
  sortableBindings: SortableBindings | null;
  onToggleExpanded: (nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
}) {
  return (
    <div
      className={clsx(
        'group flex items-center rounded-lg px-2 text-xs transition-colors',
        node.sortable && 'cursor-grab active:cursor-grabbing',
        selected
          ? 'bg-[#EEF2FF] text-[#4338CA]'
          : 'text-[#334155] hover:bg-[#F8FAFC]',
        sortableBindings?.isDragging && 'z-10 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)]',
      )}
      style={{ paddingLeft: depth * 14 + 8 }}
      onClick={() => onSelect(node.node.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(node.node.id);
        }
      }}
    >
      <ExpandButton
        visible={hasChildren}
        expanded={expanded}
        onClick={() => onToggleExpanded(node.id)}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{node.label}</div>
        <div className="truncate text-[11px] text-[#64748B]">{node.subtitle}</div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(node.node.id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        disabled={!deletable}
        className={clsx(
          'inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors',
          deletable
            ? 'text-[#94A3B8] hover:bg-[#FEE2E2] hover:text-[#B91C1C]'
            : 'cursor-not-allowed text-[#CBD5E1]',
        )}
        aria-label={`Delete ${node.node.type}`}
        title={deletable ? `删除 ${node.node.type}` : '当前节点位于必填单节点槽位，暂不支持删除'}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ColumnRow({
  node,
  depth,
  hasChildren,
  expanded,
  selected,
  sortableBindings,
  onToggleExpanded,
  onSelect,
  onDelete,
}: {
  node: ColumnTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  selected: boolean;
  sortableBindings: SortableBindings | null;
  onToggleExpanded: (nodeId: string) => void;
  onSelect: (key: SelectedColumnKey) => void;
  onDelete: (tableId: string, colIndex: number) => void;
}) {
  return (
    <div
      className={clsx(
        'flex items-center rounded-lg px-2 text-xs transition-colors',
        'cursor-grab active:cursor-grabbing',
        selected
          ? 'bg-[#EEF2FF] text-[#4338CA]'
          : 'text-[#475569] hover:bg-[#F8FAFC]',
        sortableBindings?.isDragging && 'z-10 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)]',
      )}
      style={{ paddingLeft: depth * 14 + 8 }}
      onClick={() => onSelect({ tableId: node.tableId, colIndex: node.colIndex })}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect({ tableId: node.tableId, colIndex: node.colIndex });
        }
      }}
    >
      <ExpandButton
        visible={hasChildren}
        expanded={expanded}
        onClick={() => onToggleExpanded(node.id)}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium italic">{node.label}</div>
        <div className="truncate text-[11px] text-[#94A3B8]">
          {node.subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(node.tableId, node.colIndex);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
        aria-label={`删除列 ${node.label}`}
        title={`删除列 ${node.label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function FieldRow({
  node,
  depth,
  selected,
  sortableBindings,
  onSelect,
  onDelete,
}: {
  node: FieldTreeNode;
  depth: number;
  selected: boolean;
  sortableBindings: SortableBindings | null;
  onSelect: (key: SelectedFieldKey) => void;
  onDelete: (formId: string, fieldIndex: number) => void;
}) {
  return (
    <div
      className={clsx(
        'flex items-center rounded-lg px-2 py-1 text-xs transition-colors',
        'cursor-grab active:cursor-grabbing',
        selected
          ? 'bg-[#EEF2FF] text-[#4338CA]'
          : 'text-[#475569] hover:bg-[#F8FAFC]',
        sortableBindings?.isDragging && 'z-10 bg-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.55)]',
      )}
      style={{ paddingLeft: depth * 14 + 8 }}
      onClick={() => onSelect({ formId: node.formId, fieldIndex: node.fieldIndex })}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect({ formId: node.formId, fieldIndex: node.fieldIndex });
        }
      }}
    >
      <span className="inline-flex h-6 w-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{node.label}</div>
        <div className="truncate text-[11px] text-[#94A3B8]">{node.subtitle}</div>
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(node.formId, node.fieldIndex);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
        aria-label={`删除字段 ${node.label}`}
        title={`删除字段 ${node.label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function GroupRow({
  node,
  depth,
  hasChildren,
  expanded,
  onToggleExpanded,
  onOpenDialog,
}: {
  node: GroupTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  onToggleExpanded: (nodeId: string) => void;
  onOpenDialog?: (dialog: { title: string; body: ComponentSchema }) => void;
}) {
  const isClickable = Boolean(node.dialog && onOpenDialog);

  return (
    <div
      className={clsx(
        'flex items-center rounded-lg px-2 py-1 text-xs transition-colors',
        isClickable
          ? 'cursor-pointer text-[#64748B] hover:bg-[#F8FAFC] hover:text-[#334155]'
          : 'text-[#94A3B8]',
      )}
      style={{ paddingLeft: depth * 14 + 8 }}
      onClick={isClickable ? () => onOpenDialog!(node.dialog!) : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={isClickable ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDialog!(node.dialog!);
        }
      } : undefined}
    >
      <ExpandButton
        visible={hasChildren}
        expanded={expanded}
        onClick={() => onToggleExpanded(node.id)}
      />
      <div className={clsx('min-w-0 flex-1', !isClickable && 'cursor-default')}>
        <div className="truncate font-medium">{node.label}</div>
        {node.subtitle ? <div className="truncate text-[11px] text-[#94A3B8]">{node.subtitle}</div> : null}
      </div>
      <span className="h-6 w-6 shrink-0" />
    </div>
  );
}

function ExpandButton({
  visible,
  expanded,
  onClick,
}: {
  visible: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  if (!visible) {
    return <span className="inline-flex h-6 w-6 shrink-0" />;
  }

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#94A3B8] transition-colors hover:bg-[#F1F5F9] hover:text-[#475569]"
      aria-label={expanded ? 'Collapse' : 'Expand'}
    >
      <ChevronRight className={clsx('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
    </button>
  );
}

function useTreeNodeSortable(node: ComponentTreeNode): SortableBindings | null {
  const sortableMeta = node.kind === 'component'
    ? node.sortable
    : node.kind === 'column'
      ? node.sortable
      : node.kind === 'field'
        ? node.sortable
        : null;
  const sortableId = node.kind === 'component' ? node.node.id : node.id;
  const { ref, isDragging } = useSortable({
    id: sortableId,
    group: sortableMeta?.groupId ?? `disabled:${sortableId}`,
    index: sortableMeta?.index ?? 0,
    disabled: !sortableMeta,
  });

  if (!sortableMeta) {
    return null;
  }

  return {
    ref,
    isDragging,
  };
}

function buildTreeSignature(nodes: ComponentTreeNode[]): string {
  const parts: string[] = [];

  const visit = (node: ComponentTreeNode) => {
    parts.push(getTreeNodeRenderKey(node));
    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return parts.join('|');
}

function getTreeNodeRenderKey(node: ComponentTreeNode): string {
  return node.renderKey ? `${node.id}:${node.renderKey}` : node.id;
}

function buildComponentNode(
  node: ComponentSchema,
  options: {
    sortable?: SortableMeta;
  },
): ComponentItemTreeNode {
  const n = node as Record<string, unknown>;
  const children: ComponentTreeNode[] = [];

  const directChildren = Array.isArray(n.children)
    ? (n.children as ComponentSchema[])
    : Array.isArray(n.body)
      ? (n.body as ComponentSchema[])
      : null;
  if (directChildren) {
    children.push(
      ...directChildren.map((child, index) => buildComponentNode(child, {
        sortable: { groupId: node.id, index },
      })),
    );
  }

  if (Array.isArray(n.items)) {
    children.push(...buildTabsGroups(node, n.items as Array<Record<string, unknown>>));
  }

  if (Array.isArray(n.columns)) {
    children.push(...buildColumnNodes(node.id, n.columns as Array<Record<string, unknown>>));
  }

  if (node.type === 'form' && Array.isArray(n.fields)) {
    children.push(...buildFieldNodes(node.id, n.fields as Array<Record<string, unknown>>));
  }

  if (n.itemRender && typeof n.itemRender === 'object' && !Array.isArray(n.itemRender)) {
    children.push({
      kind: 'group',
      id: `group:item-render:${node.id}`,
      label: 'render',
      subtitle: '每项渲染',
      children: [
        buildComponentNode(n.itemRender as ComponentSchema, {}),
      ],
      expandedByDefault: true,
    });
  }

  const dialogNodes = buildDialogGroups(node.id, n.action, 'action');
  if (dialogNodes.length > 0) {
    children.push(...dialogNodes);
  }

  if (Array.isArray(n.rowActions)) {
    const rowActionGroups = (n.rowActions as Array<Record<string, unknown>>)
      .flatMap((rowAction, rowActionIndex) => {
        const label = typeof rowAction.label === 'string' ? rowAction.label : `行操作 ${rowActionIndex + 1}`;
        const dialogs = buildDialogGroups(
          `${node.id}:row-action:${rowActionIndex}`,
          rowAction.action,
          `row-action:${rowActionIndex}`,
        );
        if (dialogs.length === 0) return [];
        return [{
          kind: 'group',
          id: `group:row-action:${node.id}:${rowActionIndex}`,
          label: 'action',
          subtitle: label,
          children: dialogs,
          expandedByDefault: true,
        } satisfies GroupTreeNode];
      });
    children.push(...rowActionGroups);
  }

  return {
    kind: 'component',
    id: `node:${node.id}`,
    label: node.type,
    subtitle: getComponentSummary(node as Record<string, unknown>),
    node,
    children,
    sortable: options.sortable,
    expandedByDefault: Boolean(options.sortable),
  };
}

function buildTabsGroups(
  parent: ComponentSchema,
  items: Array<Record<string, unknown>>,
): GroupTreeNode[] {
  return items.flatMap((item, tabIndex) => {
    if (!Array.isArray(item.body)) return [];
    const label = typeof item.label === 'string' ? item.label : `标签 ${tabIndex + 1}`;
    return [{
      kind: 'group',
      id: `group:tabs:${parent.id}:${tabIndex}`,
      label: 'tab',
      subtitle: label,
      children: (item.body as ComponentSchema[]).map((child, childIndex) => buildComponentNode(child, {
        sortable: {
          groupId: `slot:${encodeURIComponent(parent.id)}:tab:${tabIndex}`,
          index: childIndex,
        },
      })),
      expandedByDefault: true,
    }];
  });
}

function buildColumnNodes(
  tableId: string,
  columns: Array<Record<string, unknown>>,
) : ColumnTreeNode[] {
  return columns.map((column, colIndex) => {
    const name = typeof column.name === 'string' ? column.name : `column_${colIndex + 1}`;
    const label = typeof column.label === 'string' ? column.label : name;
    const render = column.render;
    const hasRender = Boolean(render && typeof render === 'object' && !Array.isArray(render));
    const renderKey = JSON.stringify({
      name,
      label,
      width: column.width ?? null,
      hasRender,
      renderId: hasRender ? (render as { id?: string }).id ?? null : null,
    });

    return {
      kind: 'column',
      id: getColumnSelectionId({ tableId, colIndex }),
      tableId,
      colIndex,
      label: 'column',
      subtitle: `${label}${label !== name ? ` · ${name}` : ''}${hasRender ? ' · 有渲染' : ''}`,
      hasRender,
      sortable: {
        groupId: `columns:${encodeURIComponent(tableId)}`,
        index: colIndex,
      },
      children: hasRender ? [
        buildComponentNode(render as ComponentSchema, {}),
      ] : [],
      expandedByDefault: true,
      renderKey,
    };
  });
}

function buildFieldNodes(
  formId: string,
  fields: Array<Record<string, unknown>>,
): FieldTreeNode[] {
  return fields.map((field, fieldIndex) => {
    const name = typeof field.name === 'string' ? field.name : `field_${fieldIndex + 1}`;
    const label = typeof field.label === 'string' && field.label
      ? field.label
      : name;
    const type = typeof field.type === 'string' ? field.type : 'field';
    const renderKey = JSON.stringify({
      name,
      label,
      type,
      required: Boolean(field.required),
    });

    return {
      kind: 'field',
      id: getFieldSelectionId({ formId, fieldIndex }),
      formId,
      fieldIndex,
      label: type,
      subtitle: `${label}${label !== name ? ` · ${name}` : ''}${field.required ? ' · 必填' : ''}`,
      children: [],
      sortable: {
        groupId: `fields:${encodeURIComponent(formId)}`,
        index: fieldIndex,
      },
      renderKey,
    };
  });
}

function buildDialogGroups(
  ownerId: string,
  actions: unknown,
  prefix: string,
): GroupTreeNode[] {
  return extractDialogs(actions, prefix).map((dialog) => ({
    kind: 'group',
    id: `dialog:${ownerId}:${dialog.id}`,
    label: 'dialog',
    subtitle: `${dialog.title} · 点击打开预览`,
    children: [buildComponentNode(dialog.body, {})],
    dialog,
    expandedByDefault: false,
  }));
}

function extractDialogs(actions: unknown, prefix: string): DialogInfo[] {
  if (!actions) return [];

  const list = Array.isArray(actions) ? actions : [actions];
  const result: DialogInfo[] = [];

  for (const [index, action] of list.entries()) {
    if (!action || typeof action !== 'object') continue;
    const currentPath = `${prefix}.${index}`;
    const current = action as Record<string, unknown>;

    if (current.type === 'dialog' && current.body && typeof current.body === 'object' && !Array.isArray(current.body)) {
      result.push({
        id: currentPath,
        title: typeof current.title === 'string' ? current.title : 'Dialog',
        body: current.body as ComponentSchema,
      });
    }

    result.push(...extractDialogs(current.onSuccess, `${currentPath}.onSuccess`));
    result.push(...extractDialogs(current.onError, `${currentPath}.onError`));
    result.push(...extractDialogs(current.onConfirm, `${currentPath}.onConfirm`));
    result.push(...extractDialogs(current.onCancel, `${currentPath}.onCancel`));
  }

  return result;
}
