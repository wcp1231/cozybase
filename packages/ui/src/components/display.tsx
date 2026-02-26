import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  registerBuiltinComponent,
  type SchemaComponentProps,
} from '../engine/registry';
import { usePageContext, useComponentStates } from '../engine/context';
import { resolveExpression } from '../engine/expression';
import { dispatchAction } from '../engine/action';
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
  const [data, setData] = useState<unknown[]>([]);
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
        method: api.method || 'GET',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      // Support both array response and { data: [...] } / { items: [...] } response
      const items = Array.isArray(json)
        ? json
        : (json.data ?? json.items ?? []);
      setData(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api.url, api.method, baseUrl, paramsKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ============================================================
// Text Component
// ============================================================

function TextComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as TextComponent;
  const resolved = resolveExpression(s.text, exprContext);

  return (
    <span style={s.style} className={s.className}>
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
    { style: { margin: '0 0 8px 0', ...s.style }, className: s.className },
    String(resolved ?? ''),
  );
}

// ============================================================
// Tag Component
// ============================================================

const TAG_COLORS: Record<string, { bg: string; color: string }> = {
  default: { bg: '#f0f0f0', color: '#333333' },
  success: { bg: '#D1FAE5', color: '#065F46' },
  warning: { bg: '#FEF3C7', color: '#92400E' },
  error: { bg: '#FEE2E2', color: '#991B1B' },
  info: { bg: '#DBEAFE', color: '#1E40AF' },
};

function TagComp({ schema, exprContext }: SchemaComponentProps) {
  const s = schema as TagComponent;
  const resolved = resolveExpression(s.text, exprContext);
  const resolvedColor = s.color
    ? String(resolveExpression(s.color, exprContext) ?? 'default')
    : 'default';
  const colors = TAG_COLORS[resolvedColor] ?? TAG_COLORS.default;

  return (
    <span
      style={{
        display: 'inline-block',
        backgroundColor: colors.bg,
        color: colors.color,
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        lineHeight: '18px',
        ...s.style,
      }}
      className={s.className}
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
      style={{
        padding: 16,
        backgroundColor: '#fff',
        borderRadius: 8,
        border: '1px solid #e5e7eb',
        ...s.style,
      }}
      className={s.className}
    >
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
        {String(resolvedLabel ?? '')}
      </div>
      <div style={{ fontSize: 24, fontWeight: 600, color: '#111827' }}>
        {resolvedPrefix != null && (
          <span style={{ fontSize: 14, fontWeight: 400, marginRight: 4 }}>
            {String(resolvedPrefix)}
          </span>
        )}
        {String(resolvedValue ?? '')}
        {resolvedSuffix != null && (
          <span style={{ fontSize: 14, fontWeight: 400, marginLeft: 4 }}>
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

  const { data, loading, error, refetch } = useApiData(
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
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.baseUrl, exprCtx],
  );

  if (loading) {
    return <div style={{ padding: 16, color: '#6b7280' }}>加载中...</div>;
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          color: '#991B1B',
          backgroundColor: '#FEE2E2',
          borderRadius: 4,
        }}
      >
        加载失败: {error}
      </div>
    );
  }

  const rows = Array.isArray(data) ? data : [];
  const hasRowActions = s.rowActions && s.rowActions.length > 0;
  const totalColumns = s.columns.length + (hasRowActions ? 1 : 0);

  return (
    <div style={s.style} className={s.className}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 14,
        }}
      >
        <thead>
          <tr>
            {s.columns.map((col) => (
              <th
                key={col.name}
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#374151',
                  width: col.width,
                }}
              >
                {col.label}
              </th>
            ))}
            {hasRowActions && (
              <th
                style={{
                  textAlign: 'left',
                  padding: '8px 12px',
                  backgroundColor: '#f9fafb',
                  borderBottom: '1px solid #e5e7eb',
                  fontWeight: 600,
                  fontSize: 13,
                  color: '#374151',
                }}
              >
                操作
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: Record<string, unknown>, rowIndex: number) => (
            <tr
              key={(row.id as string | number) ?? rowIndex}
              style={{ borderBottom: '1px solid #e5e7eb' }}
            >
              {s.columns.map((col) => (
                <td
                  key={col.name}
                  style={{
                    padding: '8px 12px',
                    color: '#111827',
                  }}
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
                <td style={{ padding: '8px 12px' }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {s.rowActions!.map((rowAction, actionIndex) => (
                      <button
                        key={actionIndex}
                        style={{
                          padding: '4px 8px',
                          fontSize: 13,
                          color: '#2563eb',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                        onClick={() => {
                          if (rowAction.confirm) {
                            const message = String(
                              resolveExpression(rowAction.confirm, {
                                ...exprCtx,
                                row,
                              }) ?? rowAction.confirm,
                            );
                            if (window.confirm(message)) {
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
                style={{
                  padding: 24,
                  textAlign: 'center',
                  color: '#9ca3af',
                }}
              >
                暂无数据
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {paginationEnabled && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 8,
            padding: '12px 0',
            fontSize: 13,
          }}
        >
          <button
            disabled={currentPage === 0}
            onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
            style={{
              padding: '4px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              backgroundColor: currentPage === 0 ? '#f3f4f6' : '#fff',
              color: currentPage === 0 ? '#9ca3af' : '#374151',
              cursor: currentPage === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            上一页
          </button>
          <span style={{ color: '#6b7280' }}>第 {currentPage + 1} 页</span>
          <button
            disabled={rows.length < pageSize}
            onClick={() => setCurrentPage((p) => p + 1)}
            style={{
              padding: '4px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 4,
              backgroundColor:
                rows.length < pageSize ? '#f3f4f6' : '#fff',
              color: rows.length < pageSize ? '#9ca3af' : '#374151',
              cursor:
                rows.length < pageSize ? 'not-allowed' : 'pointer',
            }}
          >
            下一页
          </button>
        </div>
      )}
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
    return <div style={{ padding: 16, color: '#6b7280' }}>加载中...</div>;
  }

  if (error) {
    return (
      <div
        style={{
          padding: 16,
          color: '#991B1B',
          backgroundColor: '#FEE2E2',
          borderRadius: 4,
        }}
      >
        加载失败: {error}
      </div>
    );
  }

  const items = Array.isArray(data) ? data : [];

  return (
    <div style={s.style} className={s.className}>
      {items.map((item: Record<string, unknown>, index: number) => (
        <NodeRenderer
          key={(item.id as string | number) ?? index}
          schema={s.itemRender}
          customComponents={ctx.customComponents}
          extraContext={{ ...inheritedCtx, row: item }}
        />
      ))}
      {items.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
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
