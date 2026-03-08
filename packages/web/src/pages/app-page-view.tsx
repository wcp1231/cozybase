import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { findNodeById, getComponentSummary, SchemaRenderer, type ComponentSchema } from '@cozybase/ui';
import { ActivitySquare, Loader2, Pencil, Play, Rocket, Square } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppContext } from './app-layout';
import {
  getDefaultPagePath,
  getTopLevelPages,
  isAppMode,
  normalizeSubPath,
  resolveContentSlotState,
  toAppConsolePath,
  toAppPagePath,
  type AppMode,
} from './content-slot';
import { BridgeClient } from '../lib/bridge-client';
import { inspectPage } from '../lib/ui-inspector';
import { AppSectionHeader } from '../features/apps/app-section-header';
import {
  canDeleteNode,
  canInsertIntoNode,
  ComponentPalette,
  ComponentTree,
  createDefaultComponent,
  deleteNodeById,
  DialogPreviewOverlay,
  EditorOverlay,
  EditorToolbar,
  insertComponentAtSelection,
  moveNodeBySortablePosition,
  moveNodeBeforeSibling,
  PropertyPanel,
} from '../features/editor';
import type { SelectedColumnKey, SelectedFieldKey } from '../features/editor/component-tree';
import { buildPageTree, type PageTreeNode } from '../features/editor/page-tree';
import { useEditorStore } from '../stores/editor-store';

function serializePagesJson(value: unknown): string {
  return value ? JSON.stringify(value) : '';
}

export function AppPageView() {
  const { appName, '*': subPath, mode: modeParam } = useParams<{ appName: string; '*': string; mode: string }>();
  const { app, appLoading, appError, pagesJson, refreshApp, refreshApps, toggleSidebar, sidebarVisible } = useAppContext();
  const mode: AppMode = isAppMode(modeParam) ? modeParam : 'stable';
  const navigate = useNavigate();
  const location = useLocation();
  const [busyAction, setBusyAction] = useState<'publish' | 'start' | 'stop' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const {
    active: editorActive,
    originalJson,
    draftJson,
    selectedNodeId,
    hoveredNodeId,
    undoStack,
    redoStack,
    dirty,
    submitting,
    enterEditMode,
    exitEditMode,
    setSelectedNodeId,
    setHoveredNodeId,
    applyEdit,
    undo,
    redo,
    reloadFromServer,
    submit,
  } = useEditorStore();
  const [pagePanelOpen, setPagePanelOpen] = useState(editorActive);
  const [propertyPanelOpen, setPropertyPanelOpen] = useState(editorActive);
  const [componentPaletteOpen, setComponentPaletteOpen] = useState(false);
  const [selectedColumnKey, setSelectedColumnKey] = useState<SelectedColumnKey | null>(null);
  const [selectedFieldKey, setSelectedFieldKey] = useState<SelectedFieldKey | null>(null);
  const [dialogPreview, setDialogPreview] = useState<{ title: string; body: ComponentSchema } | null>(null);

  const subPathRef = useRef(subPath);
  subPathRef.current = subPath;

  const params = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search],
  );

  const bridgeRef = useRef<BridgeClient | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new BridgeClient();
  }

  useEffect(() => {
    if (mode !== 'draft') return;
    const bridge = bridgeRef.current!;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/agent/ws`);
    ws.addEventListener('open', () => bridge.setWebSocket(ws));
    ws.addEventListener('close', () => bridge.setWebSocket(null));

    bridge.setHandler(async (method, reqParams) => {
      if (method === 'inspect') {
        const targetPage = typeof reqParams.page === 'string' ? reqParams.page : undefined;
        if (targetPage && targetPage !== subPathRef.current) {
          navigate(`/${mode}/apps/${appName}/${targetPage}`);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const root = document.getElementById('cz-app-content');
        if (!root) throw new Error('App content not mounted');
        return inspectPage(root, subPathRef.current || 'default');
      }

      throw new Error(`Unknown method: ${method}`);
    });

    return () => {
      bridge.setHandler(null);
      bridge.setWebSocket(null);
      ws.close();
    };
  }, [mode, appName, navigate]);

  useEffect(() => {
    if (editorActive) {
      setPagePanelOpen(true);
      setPropertyPanelOpen(true);
    } else {
      setPagePanelOpen(false);
      setPropertyPanelOpen(false);
    }
  }, [editorActive]);

  const renderPagesJson = editorActive && draftJson ? draftJson : pagesJson;
  const slotState = resolveContentSlotState({
    appName,
    subPath,
    mode,
    pagesJson: renderPagesJson,
    appLoading,
    appError,
  });

  const topLevelPages = useMemo(
    () => getTopLevelPages(renderPagesJson?.pages ?? []),
    [renderPagesJson?.pages],
  );
  const pageTree = useMemo(
    () => buildPageTree(renderPagesJson?.pages ?? []),
    [renderPagesJson?.pages],
  );
  const fallbackSubPath = getDefaultPagePath(renderPagesJson?.pages ?? []);
  const appHomeTo = fallbackSubPath ? toAppPagePath(appName ?? '', fallbackSubPath, mode) : undefined;
  const currentSubPath = slotState.type === 'render'
    ? slotState.match.subPath
    : normalizeSubPath(subPath) ?? fallbackSubPath;
  const currentPagePath = slotState.type === 'render'
    ? slotState.match.pagePath
    : fallbackSubPath;
  const breadcrumbs = slotState.type === 'render' && slotState.match.breadcrumbs.length > 1
    ? slotState.match.breadcrumbs.map((item, index, list) => ({
      label: item.label,
      to: index < list.length - 1 ? toAppPagePath(appName ?? '', item.subPath, mode) : undefined,
    }))
    : undefined;
  const childTabs = slotState.type === 'render' ? slotState.match.childTabs : [];
  const hasEditorConflict = Boolean(
    editorActive &&
    pagesJson &&
    originalJson &&
    serializePagesJson(pagesJson) !== serializePagesJson(originalJson),
  );
  const selectedNode = useMemo(() => {
    if (!draftJson || !selectedNodeId) return null;
    return findNodeById(draftJson, selectedNodeId)?.node ?? null;
  }, [draftJson, selectedNodeId]);
  const insertHint = useMemo(() => {
    if (!selectedNode) return '未选中组件时，新组件会追加到当前页面末尾。';
    return canInsertIntoNode(selectedNode)
      ? `当前会插入到 ${selectedNode.type} 内部。`
      : `当前会插入到 ${selectedNode.type} 后方。`;
  }, [selectedNode]);

  const goToUrl = useCallback(
    (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.location.href = url;
        return;
      }
      navigate(url);
    },
    [navigate],
  );

  const handleEnterEditMode = () => {
    if (!pagesJson) return;
    enterEditMode(pagesJson);
    setComponentPaletteOpen(false);
    setActionError(null);
  };

  const handleExitEditMode = () => {
    if (dirty && typeof window !== 'undefined') {
      const confirmed = window.confirm('存在未保存修改，确定要退出编辑模式吗？');
      if (!confirmed) return;
    }
    exitEditMode();
    setPagePanelOpen(false);
    setPropertyPanelOpen(false);
    setComponentPaletteOpen(false);
    setDialogPreview(null);
  };

  const handleSaveDraft = async () => {
    if (!appName) return;
    setActionError(null);

    try {
      await submit(appName);
      await refreshApp();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleReloadEditor = () => {
    if (!pagesJson) return;
    reloadFromServer(pagesJson);
    setActionError(null);
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setSelectedColumnKey(null);
    setSelectedFieldKey(null);
  };

  const handleSelectColumn = (key: SelectedColumnKey) => {
    setSelectedColumnKey(key);
    setSelectedNodeId(null);
    setSelectedFieldKey(null);
  };

  const handleSelectField = (key: SelectedFieldKey) => {
    setSelectedFieldKey(key);
    setSelectedNodeId(null);
    setSelectedColumnKey(null);
  };

  const handleDeleteColumn = (tableId: string, colIndex: number) => {
    if (!draftJson) return;
    const loc = findNodeById(draftJson, tableId);
    if (!loc) return;
    const cols = ((loc.node as Record<string, unknown>).columns as unknown[]) ?? [];
    const col = cols[colIndex] as Record<string, unknown> | undefined;
    const colLabel = col ? (String(col.label || col.name || `第 ${colIndex + 1} 列`)) : `第 ${colIndex + 1} 列`;

    if (col?.render) {
      const confirmed = window.confirm(`列 "${colLabel}" 含有自定义渲染组件，确定删除？`);
      if (!confirmed) return;
    }

    applyEdit((nextDraft) => {
      const nextLoc = findNodeById(nextDraft, tableId);
      if (!nextLoc) return;
      const nextNode = { ...(nextLoc.node as Record<string, unknown>) };
      const nextCols = Array.isArray(nextNode.columns) ? [...nextNode.columns] : [];
      nextCols.splice(colIndex, 1);
      nextNode.columns = nextCols;
      if (nextLoc.slotMutator) {
        nextLoc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        nextLoc.siblings[nextLoc.index] = nextNode as ComponentSchema;
      }
    });

    // Clear column selection if we deleted the selected column
    if (selectedColumnKey?.tableId === tableId && selectedColumnKey?.colIndex === colIndex) {
      setSelectedColumnKey(null);
    }
  };

  const handleMoveColumn = (tableId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    applyEdit((nextDraft) => {
      const loc = findNodeById(nextDraft, tableId);
      if (!loc) return;
      const nextNode = { ...(loc.node as Record<string, unknown>) };
      const nextCols = Array.isArray(nextNode.columns) ? [...(nextNode.columns as unknown[])] : [];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= nextCols.length || toIndex >= nextCols.length) return;
      const [col] = nextCols.splice(fromIndex, 1);
      nextCols.splice(toIndex, 0, col);
      nextNode.columns = nextCols;
      if (loc.slotMutator) {
        loc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        loc.siblings[loc.index] = nextNode as ComponentSchema;
      }
    });
    // Update selectedColumnKey to follow the moved column
    if (selectedColumnKey?.tableId === tableId) {
      const { colIndex } = selectedColumnKey;
      let nextIndex = colIndex;
      if (colIndex === fromIndex) {
        nextIndex = toIndex;
      } else if (fromIndex < colIndex && colIndex <= toIndex) {
        nextIndex = colIndex - 1;
      } else if (toIndex <= colIndex && colIndex < fromIndex) {
        nextIndex = colIndex + 1;
      }
      if (nextIndex !== colIndex) setSelectedColumnKey({ tableId, colIndex: nextIndex });
    }
  };

  const handleDeleteField = (formId: string, fieldIndex: number) => {
    if (!draftJson || typeof window === 'undefined') return;
    const loc = findNodeById(draftJson, formId);
    if (!loc) return;
    const fields = ((loc.node as Record<string, unknown>).fields as unknown[]) ?? [];
    const field = fields[fieldIndex] as Record<string, unknown> | undefined;
    const fieldLabel = field ? String(field.label || field.name || `第 ${fieldIndex + 1} 个字段`) : `第 ${fieldIndex + 1} 个字段`;

    const confirmed = window.confirm(`确定删除字段 "${fieldLabel}" 吗？`);
    if (!confirmed) return;

    applyEdit((nextDraft) => {
      const nextLoc = findNodeById(nextDraft, formId);
      if (!nextLoc) return;
      const nextNode = { ...(nextLoc.node as Record<string, unknown>) };
      const nextFields = Array.isArray(nextNode.fields) ? [...(nextNode.fields as unknown[])] : [];
      nextFields.splice(fieldIndex, 1);
      nextNode.fields = nextFields;
      if (nextLoc.slotMutator) {
        nextLoc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        nextLoc.siblings[nextLoc.index] = nextNode as ComponentSchema;
      }
    });

    if (selectedFieldKey?.formId === formId && selectedFieldKey.fieldIndex === fieldIndex) {
      setSelectedFieldKey(null);
    }
  };

  const handleMoveField = (formId: string, fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    applyEdit((nextDraft) => {
      const loc = findNodeById(nextDraft, formId);
      if (!loc) return;
      const nextNode = { ...(loc.node as Record<string, unknown>) };
      const nextFields = Array.isArray(nextNode.fields) ? [...(nextNode.fields as unknown[])] : [];
      if (fromIndex < 0 || toIndex < 0 || fromIndex >= nextFields.length || toIndex >= nextFields.length) return;
      const [field] = nextFields.splice(fromIndex, 1);
      nextFields.splice(toIndex, 0, field);
      nextNode.fields = nextFields;
      if (loc.slotMutator) {
        loc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        loc.siblings[loc.index] = nextNode as ComponentSchema;
      }
    });

    if (selectedFieldKey?.formId === formId) {
      const { fieldIndex } = selectedFieldKey;
      let nextIndex = fieldIndex;
      if (fieldIndex === fromIndex) {
        nextIndex = toIndex;
      } else if (fromIndex < fieldIndex && fieldIndex <= toIndex) {
        nextIndex = fieldIndex - 1;
      } else if (toIndex <= fieldIndex && fieldIndex < fromIndex) {
        nextIndex = fieldIndex + 1;
      }
      if (nextIndex !== fieldIndex) setSelectedFieldKey({ formId, fieldIndex: nextIndex });
    }
  };

  const handleColumnChange = (tableId: string, colIndex: number, key: string, value: unknown) => {
    applyEdit((nextDraft) => {
      const loc = findNodeById(nextDraft, tableId);
      if (!loc) return;
      const nextNode = { ...(loc.node as Record<string, unknown>) };
      const nextCols = Array.isArray(nextNode.columns) ? [...(nextNode.columns as unknown[])] : [];
      const nextCol = { ...(nextCols[colIndex] as Record<string, unknown>) };
      if (value === undefined) {
        delete nextCol[key];
      } else {
        nextCol[key] = value;
      }
      nextCols[colIndex] = nextCol;
      nextNode.columns = nextCols;
      if (loc.slotMutator) {
        loc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        loc.siblings[loc.index] = nextNode as ComponentSchema;
      }
    });
  };

  const handleFieldChange = (formId: string, fieldIndex: number, key: string, value: unknown) => {
    applyEdit((nextDraft) => {
      const loc = findNodeById(nextDraft, formId);
      if (!loc) return;
      const nextNode = { ...(loc.node as Record<string, unknown>) };
      const nextFields = Array.isArray(nextNode.fields) ? [...(nextNode.fields as unknown[])] : [];
      const nextField = { ...(nextFields[fieldIndex] as Record<string, unknown>) };
      if (value === undefined) {
        delete nextField[key];
      } else {
        nextField[key] = value;
      }
      nextFields[fieldIndex] = nextField;
      nextNode.fields = nextFields;
      if (loc.slotMutator) {
        loc.slotMutator.set(nextNode as ComponentSchema);
      } else {
        loc.siblings[loc.index] = nextNode as ComponentSchema;
      }
    });
  };

  const handlePropertyChange = (key: string, value: unknown) => {
    applyEdit((nextDraft) => {
      if (!selectedNodeId) {
        const pageIndex = nextDraft.pages.findIndex((item) => item.path === currentPagePath);
        if (pageIndex < 0) return;

        const nextPage = { ...nextDraft.pages[pageIndex] } as Record<string, unknown>;
        if (value === undefined) {
          delete nextPage[key];
        } else {
          nextPage[key] = value;
        }

        nextDraft.pages[pageIndex] = nextPage as any;
        return;
      }

      const location = findNodeById(nextDraft, selectedNodeId);
      if (!location) return;

      const nextNode = { ...(location.node as Record<string, unknown>) };
      if (value === undefined) {
        delete nextNode[key];
      } else {
        nextNode[key] = value;
      }

      if (location.slotMutator) {
        location.slotMutator.set(nextNode as any);
      } else {
        location.siblings[location.index] = nextNode as any;
      }
    });
  };

  const handleInsertComponent = (type: string) => {
    if (!draftJson || slotState.type !== 'render') return;

    const nextNode = createDefaultComponent(type) as ComponentSchema;

    applyEdit((nextDraft) => {
      insertComponentAtSelection(nextDraft, slotState.match.pagePath, selectedNodeId, nextNode);
    });

    setSelectedNodeId(nextNode.id);
    setComponentPaletteOpen(false);
    setActionError(null);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!draftJson) return;
    if (!canDeleteNode(draftJson, nodeId)) {
      setActionError('当前节点位于必填单节点槽位，暂不支持删除。');
      return;
    }

    const location = findNodeById(draftJson, nodeId);
    if (!location || typeof window === 'undefined') return;

    const confirmed = window.confirm(
      `确定删除 ${location.node.type}（${getComponentSummary(location.node as Record<string, unknown>) || location.node.id}）及其全部子节点吗？`,
    );
    if (!confirmed) return;

    applyEdit((nextDraft) => {
      deleteNodeById(nextDraft, nodeId);
    });
    setActionError(null);
  };

  const handleMoveNode = ({
    activeNodeId,
    sourceGroupId,
    targetGroupId,
    fromIndex,
    toIndex,
    overNodeId,
  }: {
    activeNodeId: string;
    sourceGroupId: string;
    targetGroupId: string;
    fromIndex: number;
    toIndex: number;
    overNodeId: string | null;
  }) => {
    if (!draftJson) return;

    let moved = false;
    applyEdit((nextDraft) => {
      moved = moveNodeBySortablePosition(nextDraft, sourceGroupId, targetGroupId, fromIndex, toIndex);
      if (!moved && overNodeId) {
        moved = moveNodeBeforeSibling(nextDraft, activeNodeId, overNodeId);
      }
    });

    if (!moved) {
      setActionError('当前仅支持同一父容器内的拖拽排序。');
      return;
    }

    setSelectedNodeId(activeNodeId);
    setSelectedColumnKey(null);
    setSelectedFieldKey(null);
    setActionError(null);
  };

  const handlePublish = async () => {
    if (!appName) return;

    setBusyAction('publish');
    setActionError(null);

    try {
      const response = await fetch(`/draft/apps/${appName}/publish`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await Promise.all([refreshApp(), refreshApps()]);
      navigate(toAppPagePath(appName, currentSubPath, 'stable'));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleStable = async () => {
    if (!appName || !app?.stableStatus) return;

    const nextAction = app.stableStatus === 'running' ? 'stop' : 'start';
    setBusyAction(nextAction);
    setActionError(null);

    try {
      const response = await fetch(`/api/v1/apps/${appName}/${nextAction}`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await Promise.all([refreshApp(), refreshApps()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (slotState.type === 'redirect') {
    return <Navigate to={slotState.to} replace />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppSectionHeader
        mode={mode}
        appName={appName}
        appDisplayName={app?.displayName}
        appHomeTo={appHomeTo}
        stableStatus={app?.stableStatus ?? null}
        breadcrumbs={breadcrumbs}
        toggleSidebar={toggleSidebar}
        sidebarVisible={sidebarVisible}
        actions={
          mode === 'draft' ? (
            <>
              <Link
                to={toAppConsolePath(appName ?? '', mode)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] no-underline transition-colors hover:bg-[#F8FAFC]"
              >
                <ActivitySquare className="h-4 w-4" />
                控制台
              </Link>
              <button
                type="button"
                onClick={editorActive ? handleExitEditMode : handleEnterEditMode}
                className={clsx(
                  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors',
                  editorActive
                    ? 'border border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]'
                    : 'border border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]',
                )}
              >
                <Pencil className="h-4 w-4" />
                {editorActive ? '退出编辑' : '编辑 UI'}
              </button>
              <button
                type="button"
                onClick={handlePublish}
                disabled={busyAction !== null}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                发布
              </button>
            </>
          ) : app?.stableStatus ? (
            <button
              type="button"
              onClick={handleToggleStable}
              disabled={busyAction !== null}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : app.stableStatus === 'running' ? (
                <Square className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {app.stableStatus === 'running' ? '停止' : '启动'}
            </button>
          ) : null
        }
      />

      <main className="min-h-0 flex-1 overflow-hidden">
        {actionError && (
          <div className="mx-4 mb-4 mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C] md:mx-8">
            {actionError}
          </div>
        )}
        {editorActive && hasEditorConflict && (
          <div className="mx-4 mb-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-4 py-3 text-sm text-[#92400E] md:mx-8">
            <div>Agent 在你编辑期间修改了当前 UI，保存将覆盖这些变更。</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleReloadEditor}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-[#FCD34D] bg-white px-3 text-xs font-semibold text-[#92400E] transition-colors hover:bg-[#FEF3C7]"
              >
                放弃本地修改并重载
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={submitting}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-[#D97706] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#B45309] disabled:cursor-not-allowed disabled:opacity-60"
              >
                继续保存覆盖
              </button>
            </div>
          </div>
        )}

        {slotState.type === 'loading' ? (
          <div className="h-full overflow-auto">
            <LoadingSkeleton />
          </div>
        ) : slotState.type === 'error' || slotState.type === 'no-ui' || slotState.type === 'not-found' ? (
          <div className="h-full overflow-auto">
            <EmptyState message={slotState.message} />
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F8FAFC]">
            {topLevelPages.length > 1 || editorActive ? (
              <div className="flex min-h-11 items-end justify-between gap-4 border-b border-[#E7EBF2] bg-white px-4 md:px-8">
                <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
                  {topLevelPages.length > 1 ? topLevelPages.map((page) => (
                    <Link
                      key={page.path}
                      to={toAppPagePath(appName ?? '', page.path, mode)}
                      className={clsx(
                        'inline-flex h-11 shrink-0 items-center border-b-2 px-3 text-[13px] no-underline transition-colors',
                        page.path === currentPagePath
                          ? 'border-[#4F46E5] font-semibold text-[#4F46E5]'
                          : 'border-transparent font-medium text-[#94A3B8] hover:text-[#475569]',
                      )}
                    >
                      {page.title}
                    </Link>
                  )) : <div className="h-11" />}
                </div>

                {editorActive ? (
                  <div className="flex h-11 items-center">
                    <EditorToolbar
                      compact
                      dirty={dirty}
                      submitting={submitting}
                      canUndo={undoStack.length > 0}
                      canRedo={redoStack.length > 0}
                      onUndo={undo}
                      onRedo={redo}
                      onSave={handleSaveDraft}
                      pagePanelOpen={pagePanelOpen}
                      onTogglePagePanel={() => setPagePanelOpen((open) => !open)}
                      propertyPanelOpen={propertyPanelOpen}
                      onTogglePropertyPanel={() => setPropertyPanelOpen((open) => !open)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {childTabs.length > 0 ? (
              <div className="flex min-h-10 items-center gap-2 border-b border-[#E7EBF2] bg-[#FCFDFE] px-4 py-2 md:px-8">
                {childTabs.map((page) => (
                  <Link
                    key={page.pagePath}
                    to={toAppPagePath(appName ?? '', page.subPath, mode)}
                    className={clsx(
                      'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium no-underline transition-colors',
                      page.active
                        ? 'bg-[#EEF2FF] text-[#4F46E5]'
                        : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#334155]',
                    )}
                  >
                    {page.label}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex min-h-0 flex-1 bg-white">
              {mode === 'draft' && pagePanelOpen && renderPagesJson?.pages.length ? (
                <aside
                  className={clsx(
                    'min-h-0 shrink-0 overflow-y-auto border-r border-[#E7EBF2] bg-white shadow-[4px_0_16px_rgba(0,0,0,0.10)]',
                    editorActive ? 'w-[320px]' : 'w-[210px]',
                  )}
                >
                  <div className="flex h-10 items-center px-3.5">
                    <span className="text-xs font-bold text-[#64748B]">页面</span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-2 pb-2">
                    {pageTree.map((node) => renderPageTreeNode({
                      node,
                      depth: 0,
                      appName: appName ?? '',
                      mode,
                      currentPagePath,
                    }))}
                  </div>

                  {editorActive && slotState.type === 'render' ? (
                    <div className="border-t border-[#E7EBF2] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-[#64748B]">组件</div>
                          <div className="mt-1 text-[11px] leading-5 text-[#64748B]">
                            {insertHint}
                          </div>
                        </div>
                        <ComponentPalette
                          open={componentPaletteOpen}
                          onToggle={() => setComponentPaletteOpen((open) => !open)}
                          onInsert={handleInsertComponent}
                        />
                      </div>

                      <div className="mt-3 rounded-xl border border-[#E2E8F0] bg-[#FCFDFE] py-2">
                        <div className="flex items-center justify-between px-3 pb-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#64748B]">
                            当前页面结构
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">
                            {slotState.match.page.body.length} 顶层节点
                          </span>
                        </div>
                        <ComponentTree
                          page={slotState.match.page}
                          selectedNodeId={selectedNodeId}
                          selectedColumnKey={selectedColumnKey}
                          selectedFieldKey={selectedFieldKey}
                          canDeleteNode={(nodeId) => (draftJson ? canDeleteNode(draftJson, nodeId) : false)}
                          onSelect={handleSelectNode}
                          onSelectColumn={handleSelectColumn}
                          onSelectField={handleSelectField}
                          onDeleteColumn={handleDeleteColumn}
                          onDeleteField={handleDeleteField}
                          onDelete={handleDeleteNode}
                          onMove={handleMoveNode}
                          onMoveColumn={handleMoveColumn}
                          onMoveField={handleMoveField}
                          onOpenDialog={setDialogPreview}
                        />
                      </div>
                    </div>
                  ) : null}
                </aside>
              ) : null}

              <div
                id="cz-app-content"
                className={clsx(
                  'cz-app-canvas relative min-h-0 flex-1 overflow-auto bg-[#F8FAFC] px-4 py-5 md:px-7 md:py-7',
                  mode === 'draft' && 'cz-app-canvas--draft',
                )}
              >
                <SchemaRenderer
                  schema={slotState.match.page}
                  baseUrl={slotState.baseUrl}
                  currentPath={slotState.currentPath}
                  components={renderPagesJson?.components ?? {}}
                  params={slotState.type === 'render' ? { ...params, ...slotState.match.params } : params}
                  navigate={goToUrl}
                />
                <EditorOverlay
                  active={editorActive}
                  selectedNodeId={selectedNodeId}
                  hoveredNodeId={hoveredNodeId}
                  onSelect={(nodeId) => {
                    setSelectedNodeId(nodeId);
                    setSelectedColumnKey(null);
                    setSelectedFieldKey(null);
                  }}
                  onHover={setHoveredNodeId}
                />
              </div>

              {editorActive && propertyPanelOpen ? (
                <PropertyPanel
                  draftJson={draftJson}
                  currentPagePath={currentPagePath ?? null}
                  selectedNodeId={selectedNodeId}
                  selectedColumnKey={selectedColumnKey}
                  selectedFieldKey={selectedFieldKey}
                  onChange={handlePropertyChange}
                  onColumnChange={handleColumnChange}
                  onFieldChange={handleFieldChange}
                />
              ) : null}
            </div>

            {editorActive && dialogPreview ? (
              <DialogPreviewOverlay
                title={dialogPreview.title}
                body={dialogPreview.body}
                baseUrl={slotState.baseUrl}
                components={renderPagesJson?.components ?? {}}
                params={slotState.type === 'render' ? { ...params, ...slotState.match.params } : params}
                navigate={goToUrl}
                selectedNodeId={selectedNodeId}
                hoveredNodeId={hoveredNodeId}
                onSelect={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setSelectedColumnKey(null);
                  setSelectedFieldKey(null);
                }}
                onHover={setHoveredNodeId}
                onClose={() => setDialogPreview(null)}
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-[18px] bg-white p-6">
      <div className="h-7 w-40 animate-pulse rounded bg-[#E2E8F0]" />
      <div className="h-4 w-80 animate-pulse rounded bg-[#E2E8F0]" />
      <div className="h-64 w-full animate-pulse rounded-2xl bg-[#E2E8F0]" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[480px] items-center justify-center rounded-[18px] border border-dashed border-[#D7DEEA] bg-white px-6 text-center">
      <div>
        <div className='font-["Outfit",sans-serif] text-xl font-bold text-[#18181B]'>当前还没有可渲染内容</div>
        <div className="mt-2 max-w-md text-sm leading-6 text-[#64748B]">{message}</div>
      </div>
    </div>
  );
}

function renderPageTreeNode({
  node,
  depth,
  appName,
  mode,
  currentPagePath,
}: {
  node: PageTreeNode;
  depth: number;
  appName: string;
  mode: AppMode;
  currentPagePath?: string;
}) {
  return (
    <div key={node.key} className="flex flex-col gap-0.5">
      {node.page ? (
        <Link
          to={toAppPagePath(appName, node.page.path, mode)}
          className={clsx(
            'rounded-[8px] py-2 text-xs no-underline transition-colors',
            node.page.path === currentPagePath
              ? 'bg-[#EEF2FF] text-[#4F46E5]'
              : 'text-[#475569] hover:bg-[#F8FAFC]',
          )}
          style={{ paddingLeft: 12 + depth * 18, paddingRight: 12 }}
        >
          <div className="min-w-0">
            <div className={clsx('truncate', node.page.path === currentPagePath ? 'font-semibold' : 'font-medium')}>
              {node.page.title}
            </div>
            <div className={clsx('truncate text-[11px]', node.page.path === currentPagePath ? 'text-[#6366F1]' : 'text-[#94A3B8]')}>
              /{node.page.path}
            </div>
          </div>
        </Link>
      ) : (
        <div
          className="truncate py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#94A3B8]"
          style={{ paddingLeft: 12 + depth * 18, paddingRight: 12 }}
        >
          {node.segment}
        </div>
      )}

      {node.children.map((child) => renderPageTreeNode({
        node: child,
        depth: depth + 1,
        appName,
        mode,
        currentPagePath,
      }))}
    </div>
  );
}
