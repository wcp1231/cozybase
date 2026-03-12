import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clsx } from 'clsx';
import {
  registerBuiltinComponent,
  type SchemaComponentProps,
} from '../engine/registry';
import { usePageContext, useComponentStates } from '../engine/context';
import { resolveExpression } from '../engine/expression';
import { dispatchAction } from '../engine/action';
import { toArray } from '../renderer';
import type {
  TableComponent,
  ListComponent,
  TextComponent,
  HeadingComponent,
  TagComponent,
  StatComponent,
  ExpressionContext,
  ApiConfig,
  ActionSchema,
  ColumnSchema,
} from '../schema/types';
import { NodeRenderer } from '../renderer';

// ============================================================
// Helper hook: useApiData
// ============================================================

function useApiData(
  api: ApiConfig,
  baseUrl: string,
  expressionContext: ExpressionContext,
  extraParams?: Record<string, string | number>,
) {
  type ApiMeta = {
    total?: number;
    limit?: number;
    offset?: number;
  };

  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [meta, setMeta] = useState<ApiMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Resolve expression params
  const resolvedParams: Record<string, string> = {};
  if (api.params) {
    for (const [key, value] of Object.entries(api.params)) {
      const resolved = resolveExpression(value, expressionContext);
      resolvedParams[key] =
        resolved === undefined || resolved === null ? '' : String(resolved);
    }
  }
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      resolvedParams[key] = String(value);
    }
  }

  const paramsKey = JSON.stringify(resolvedParams);
  const resolvedParamsRef = useRef(resolvedParams);
  resolvedParamsRef.current = resolvedParams;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = api.url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = baseUrl + url;
      }

      const params = resolvedParamsRef.current;
      const queryParts: string[] = [];
      for (const [key, value] of Object.entries(params)) {
        if (value !== '') {
          queryParts.push(
            `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
          );
        }
      }
      if (queryParts.length > 0) {
        url += (url.includes('?') ? '&' : '?') + queryParts.join('&');
      }

      const response = await fetch(url, {
        method: api.method ?? 'GET',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = (await response.json()) as { data?: unknown; meta?: ApiMeta | null };
      const items = Array.isArray(json.data)
        ? (json.data as Record<string, unknown>[])
        : [];
      const nextMeta = json.meta && typeof json.meta === 'object'
        ? {
            total: typeof json.meta.total === 'number' ? json.meta.total : undefined,
            limit: typeof json.meta.limit === 'number' ? json.meta.limit : undefined,
            offset: typeof json.meta.offset === 'number' ? json.meta.offset : undefined,
          }
        : null;
      setData(items);
      setMeta(nextMeta);
    } catch (err) {
      setMeta(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.url, api.method, baseUrl, paramsKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, meta, loading, error, refetch: fetchData };
}

// ============================================================
// Text Component
// ============================================================

function TextComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as TextComponent;
  const resolved = resolveExpression(s.text, exprContext);

  return (
    <span className={s.className} style={s.style}>
      {String(resolved ?? '')}
    </span>
  );
}

// ============================================================
// Heading Component
// ============================================================

function HeadingComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as HeadingComponent;
  const resolved = resolveExpression(s.text, exprContext);
  const level = s.level ?? 2;

  return React.createElement(
    `h${level}`,
    { className: clsx('mb-2', s.className), style: s.style },
    String(resolved ?? ''),
  );
}

// ============================================================
// Tag Component
// ============================================================

const TAG_CLASSES: Record<string, string> = {
  default: 'bg-bg-muted text-text-secondary',
  success: 'bg-success-bg text-success-text',
  warning: 'bg-warning-bg text-warning-text',
  error: 'bg-error-bg text-error-text',
  info: 'bg-info-bg text-info-text',
};

function TagComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as TagComponent;
  const resolved = resolveExpression(s.text, exprContext);
  const resolvedColor = s.color
    ? String(resolveExpression(s.color, exprContext) ?? 'default')
    : 'default';
  const colorClass = TAG_CLASSES[resolvedColor] ?? TAG_CLASSES.default;

  return (
    <span
      className={clsx(
        'inline-block rounded-sm px-2 py-0.5 text-xs leading-[18px]',
        colorClass,
        s.className,
      )}
      style={s.style}
    >
      {String(resolved ?? '')}
    </span>
  );
}

// ============================================================
// Stat Component
// ============================================================

function StatComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as StatComponent;
  const resolvedLabel = resolveExpression(s.label, exprContext);
  const resolvedValue = resolveExpression(s.value, exprContext);
  const resolvedPrefix = s.prefix
    ? resolveExpression(s.prefix, exprContext)
    : null;
  const resolvedSuffix = s.suffix
    ? resolveExpression(s.suffix, exprContext)
    : null;

  return (
    <div
      className={clsx('p-4 bg-bg rounded-md border border-border', s.className)}
      style={s.style}
    >
      <div className="text-[13px] text-text-muted mb-1">
        {String(resolvedLabel ?? '')}
      </div>
      <div className="text-2xl font-semibold text-text">
        {resolvedPrefix != null && (
          <span className="text-sm font-normal mr-1">
            {String(resolvedPrefix)}
          </span>
        )}
        {String(resolvedValue ?? '')}
        {resolvedSuffix != null && (
          <span className="text-sm font-normal ml-1">
            {String(resolvedSuffix)}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Table Component
// ============================================================

function TableComp({ schema, exprContext: parentExprCtx }: SchemaComponentProps) {
  const s = schema as TableComponent;
  const ctx = usePageContext();
  const componentStates = useComponentStates();
  const exprCtx: ExpressionContext = { ...parentExprCtx, components: componentStates };

  // Parent context scopes (props, params, form, etc.) to inherit for child renders.
  // Excludes `components` since NodeRenderer supplies its own via useComponentStates().
  const { components: _, ...inheritedCtx } = parentExprCtx;

  // Pagination state
  const pageSize = s.pageSize ?? 20;
  const paginationEnabled = s.pagination !== false;
  const [currentPage, setCurrentPage] = useState(0);

  // Build extra params for pagination
  const extraParams: Record<string, string | number> | undefined =
    paginationEnabled
      ? { limit: pageSize, offset: currentPage * pageSize }
      : undefined;

  const { data, meta, loading, error, refetch } = useApiData(
    s.api,
    ctx.baseUrl,
    exprCtx,
    extraParams,
  );

  // Register component state on mount if schema has id
  const schemaId = s.id;
  useEffect(() => {
    if (schemaId) {
      ctx.registerComponent(schemaId, { data: [] });
      return () => ctx.unregisterComponent(schemaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId]);

  // Update component data when data changes
  useEffect(() => {
    if (schemaId) {
      ctx.updateComponent(schemaId, { data });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, schemaId]);

  // Subscribe to reload signals
  useEffect(() => {
    if (schemaId) {
      return ctx.subscribeReload(schemaId, refetch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId, refetch]);

  const handleRowAction = useCallback(
    (action: ActionSchema | ActionSchema[], rowData: Record<string, unknown>) => {
      const rowExprCtx: ExpressionContext = {
        ...exprCtx,
        row: rowData,
      };
      dispatchAction(action, {
        baseUrl: ctx.baseUrl,
        expressionContext: rowExprCtx,
        triggerReload: ctx.triggerReload,
        openDialog: ctx.openDialog,
        closeDialog: ctx.closeDialog,
        requestConfirm: ctx.requestConfirm,
        navigate: ctx.navigate,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.baseUrl, exprCtx],
  );

  const rows = data;
  const columns = toArray<ColumnSchema>(s.columns);
  const hasRowActions = s.rowActions && s.rowActions.length > 0;
  const totalColumns = columns.length + (hasRowActions ? 1 : 0);
  const totalRows = meta?.total;
  const totalPages = typeof totalRows === 'number'
    ? Math.max(1, Math.ceil(totalRows / pageSize))
    : (rows.length > 0 ? currentPage + 2 : currentPage + 1);
  const shouldShowPagination = paginationEnabled
    && (
      typeof totalRows === 'number'
        ? totalRows > pageSize
        : rows.length >= pageSize
    );
  const isNextDisabled = typeof totalRows === 'number'
    ? currentPage >= totalPages - 1
    : rows.length < pageSize;
  const isPrevDisabled = currentPage === 0;

  useEffect(() => {
    if (!paginationEnabled) {
      if (currentPage !== 0) setCurrentPage(0);
      return;
    }

    if (typeof totalRows === 'number') {
      const lastPage = Math.max(0, Math.ceil(totalRows / pageSize) - 1);
      if (currentPage > lastPage) {
        setCurrentPage(lastPage);
      }
      return;
    }

    if (currentPage > 0 && rows.length === 0) {
      setCurrentPage(0);
    }
  }, [currentPage, pageSize, paginationEnabled, rows.length, totalRows]);

  if (loading) {
    return <div className="p-4 text-text-muted">加载中...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-error-text bg-error-bg rounded-sm">
        加载失败: {error}
      </div>
    );
  }

  return (
    <div className={s.className} style={s.style}>
      {shouldShowPagination && (
        <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-subtle/40 px-3 py-3 text-[13px]">
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-text-muted">
            <span>
              第 {currentPage + 1} / {totalPages} 页
            </span>
            <button
              disabled={isPrevDisabled}
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              className={clsx(
                'px-3 py-1 border border-border-strong rounded-sm',
                isPrevDisabled
                  ? 'bg-bg-muted text-text-placeholder cursor-not-allowed'
                  : 'bg-bg text-text-secondary cursor-pointer',
              )}
            >
              上一页
            </button>
            <button
              disabled={isNextDisabled}
              onClick={() => setCurrentPage((p) => p + 1)}
              className={clsx(
                'px-3 py-1 border border-border-strong rounded-sm',
                isNextDisabled
                  ? 'bg-bg-muted text-text-placeholder cursor-not-allowed'
                  : 'bg-bg text-text-secondary cursor-pointer',
              )}
            >
              下一页
            </button>
          </div>
        </div>
      )}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.name}
                className="text-left px-3 py-2 bg-bg-subtle border-b border-border font-semibold text-[13px] text-text-secondary"
                style={{ width: col.width }}
              >
                {col.label}
              </th>
            ))}
            {hasRowActions && (
              <th className="text-left px-3 py-2 bg-bg-subtle border-b border-border font-semibold text-[13px] text-text-secondary">
                操作
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex: number) => (
            <tr
              key={(row.id as string | number) ?? rowIndex}
              className="border-b border-border"
            >
              {columns.map((col) => (
                <td
                  key={col.name}
                  className="px-3 py-2 text-text"
                >
                  {col.render ? (
                    <NodeRenderer
                      schema={col.render}
                      customComponents={ctx.customComponents}
                      extraContext={{ ...inheritedCtx, row }}
                    />
                  ) : (
                    String(row[col.name] ?? '')
                  )}
                </td>
              ))}
              {hasRowActions && (
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    {s.rowActions!.map((rowAction, actionIndex) => (
                      <button
                        key={actionIndex}
                        className="px-2 py-1 text-[13px] text-primary bg-transparent border-0 cursor-pointer underline"
                        onClick={async () => {
                          if (rowAction.confirm) {
                            const message = String(
                              resolveExpression(rowAction.confirm, {
                                ...exprCtx,
                                row,
                              }) ?? rowAction.confirm,
                            );
                            const confirmed = await ctx.requestConfirm(message);
                            if (confirmed) {
                              handleRowAction(rowAction.action, row);
                            }
                          } else {
                            handleRowAction(rowAction.action, row);
                          }
                        }}
                      >
                        {String(resolveExpression(rowAction.label, { ...exprCtx, row }) ?? rowAction.label)}
                      </button>
                    ))}
                  </div>
                </td>
              )}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={totalColumns}
                className="p-6 text-center text-text-placeholder"
              >
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// List Component
// ============================================================

function ListComp({ schema, exprContext: parentExprCtx }: SchemaComponentProps) {
  const s = schema as ListComponent;
  const ctx = usePageContext();
  const componentStates = useComponentStates();
  const exprCtx: ExpressionContext = { ...parentExprCtx, components: componentStates };

  // Parent context scopes to inherit for child renders (excludes `components`)
  const { components: _c, ...inheritedCtx } = parentExprCtx;

  const { data, loading, error, refetch } = useApiData(
    s.api,
    ctx.baseUrl,
    exprCtx,
  );

  // Register component state on mount if schema has id
  const schemaId = s.id;
  useEffect(() => {
    if (schemaId) {
      ctx.registerComponent(schemaId, { data: [] });
      return () => ctx.unregisterComponent(schemaId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId]);

  // Update component data when data changes
  useEffect(() => {
    if (schemaId) {
      ctx.updateComponent(schemaId, { data });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, schemaId]);

  // Subscribe to reload signals
  useEffect(() => {
    if (schemaId) {
      return ctx.subscribeReload(schemaId, refetch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schemaId, refetch]);

  if (loading) {
    return <div className="p-4 text-text-muted">加载中...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-error-text bg-error-bg rounded-sm">
        加载失败: {error}
      </div>
    );
  }

  const items = data;

  return (
    <div className={s.className} style={s.style}>
      {items.map((item, index: number) => (
        <NodeRenderer
          key={(item.id as string | number) ?? index}
          schema={s.itemRender}
          customComponents={ctx.customComponents}
          extraContext={{ ...inheritedCtx, row: item }}
        />
      ))}
      {items.length === 0 && (
        <div className="p-6 text-center text-text-muted">
          暂无数据
        </div>
      )}
    </div>
  );
}

// ============================================================
// Register all display components
// ============================================================

registerBuiltinComponent('text', TextComp);
registerBuiltinComponent('heading', HeadingComp);
registerBuiltinComponent('tag', TagComp);
registerBuiltinComponent('stat', StatComp);
registerBuiltinComponent('table', TableComp);
registerBuiltinComponent('list', ListComp);
