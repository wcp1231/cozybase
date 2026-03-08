import { useEffect, useMemo, useState } from 'react';
import { findNodeById, type ComponentSchema, type PageSchema, type PagesJson } from '@cozybase/ui';

import { getPropertyDescriptors, type PropertyDescriptor } from './property-descriptors';
import { ColumnsEditor } from './columns-editor';
import type { SelectedColumnKey, SelectedFieldKey } from './component-tree';

interface ColumnRecord {
  name?: string;
  label?: string;
  width?: number | string;
  render?: unknown;
  [key: string]: unknown;
}

interface FieldRecord {
  name?: string;
  label?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: unknown;
  defaultValue?: unknown;
  [key: string]: unknown;
}

interface PropertyPanelProps {
  draftJson: PagesJson | null;
  currentPagePath: string | null;
  selectedNodeId: string | null;
  selectedColumnKey: SelectedColumnKey | null;
  selectedFieldKey: SelectedFieldKey | null;
  onChange: (key: string, value: unknown) => void;
  onColumnChange: (tableId: string, colIndex: number, key: string, value: unknown) => void;
  onFieldChange: (formId: string, fieldIndex: number, key: string, value: unknown) => void;
}

export function PropertyPanel({
  draftJson,
  currentPagePath,
  selectedNodeId,
  selectedColumnKey,
  selectedFieldKey,
  onChange,
  onColumnChange,
  onFieldChange,
}: PropertyPanelProps) {
  const selectedNode = useMemo(() => {
    if (!draftJson || !selectedNodeId) return null;
    return findNodeById(draftJson, selectedNodeId)?.node ?? null;
  }, [draftJson, selectedNodeId]);
  const selectedPage = useMemo(() => {
    if (!draftJson || !currentPagePath) return null;
    return draftJson.pages.find((page) => page.path === currentPagePath) ?? null;
  }, [currentPagePath, draftJson]);

  // Resolve selected column from draftJson
  const selectedColumn = useMemo((): ColumnRecord | null => {
    if (!draftJson || !selectedColumnKey) return null;
    const loc = findNodeById(draftJson, selectedColumnKey.tableId);
    if (!loc) return null;
    const cols = (loc.node as Record<string, unknown>).columns;
    if (!Array.isArray(cols)) return null;
    return (cols[selectedColumnKey.colIndex] as ColumnRecord) ?? null;
  }, [draftJson, selectedColumnKey]);

  const selectedField = useMemo((): FieldRecord | null => {
    if (!draftJson || !selectedFieldKey) return null;
    const loc = findNodeById(draftJson, selectedFieldKey.formId);
    if (!loc) return null;
    const fields = (loc.node as Record<string, unknown>).fields;
    if (!Array.isArray(fields)) return null;
    return (fields[selectedFieldKey.fieldIndex] as FieldRecord) ?? null;
  }, [draftJson, selectedFieldKey]);

  const target = selectedNode ?? selectedPage;
  const targetKind = selectedNode ? 'component' : 'page';

  const descriptors = useMemo(
    () => {
      if (!target) return [];
      return getPropertyDescriptors(targetKind === 'component' ? (selectedNode?.type ?? 'page') : 'page');
    },
    [selectedNode, target, targetKind],
  );

  const sections = useMemo(() => {
    const groups = new Map<string, PropertyDescriptor[]>();
    for (const descriptor of descriptors) {
      const current = groups.get(descriptor.group) ?? [];
      current.push(descriptor);
      groups.set(descriptor.group, current);
    }
    return groups;
  }, [descriptors]);

  // Column panel has priority — render after all hooks
  if (selectedColumn && selectedColumnKey) {
    return (
      <aside className="w-[320px] shrink-0 border-l border-[#E7EBF2] bg-white">
        <div className="border-b border-[#E7EBF2] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0F172A]">属性</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            当前列: <span className="font-medium text-[#334155]">{selectedColumn.label || selectedColumn.name || `第 ${selectedColumnKey.colIndex + 1} 列`}</span>
          </p>
        </div>
        <ColumnPropertyPanel
          column={selectedColumn}
          tableId={selectedColumnKey.tableId}
          colIndex={selectedColumnKey.colIndex}
          onChange={onColumnChange}
        />
      </aside>
    );
  }

  if (selectedField && selectedFieldKey) {
    return (
      <aside className="w-[320px] shrink-0 border-l border-[#E7EBF2] bg-white">
        <div className="border-b border-[#E7EBF2] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0F172A]">属性</h3>
          <p className="mt-1 text-xs text-[#64748B]">
            当前字段: <span className="font-medium text-[#334155]">{selectedField.label || selectedField.name || `第 ${selectedFieldKey.fieldIndex + 1} 个字段`}</span>
          </p>
        </div>
        <FieldPropertyPanel
          field={selectedField}
          formId={selectedFieldKey.formId}
          fieldIndex={selectedFieldKey.fieldIndex}
          onChange={onFieldChange}
        />
      </aside>
    );
  }

  if (!target) {
    return (
      <aside className="w-[320px] shrink-0 border-l border-[#E7EBF2] bg-white">
        <div className="border-b border-[#E7EBF2] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#0F172A]">属性</h3>
          <p className="mt-1 text-xs text-[#64748B]">点击预览中的组件后，可在这里编辑属性。</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[320px] shrink-0 border-l border-[#E7EBF2] bg-white">
      <div className="border-b border-[#E7EBF2] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#0F172A]">属性</h3>
        <p className="mt-1 text-xs text-[#64748B]">
          {targetKind === 'component' ? (
            <>
              当前节点: <span className="font-medium text-[#334155]">{(target as ComponentSchema).type}</span>
            </>
          ) : (
            <>
              当前页面: <span className="font-medium text-[#334155]">{(target as PageSchema).title}</span>
            </>
          )}
        </p>
      </div>

      <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-5 overflow-auto px-4 py-4">
        {Array.from(sections.entries()).map(([group, items]) => (
          <section key={group} className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">{group}</h4>
            <div className="space-y-3">
              {items.map((descriptor) => (
                <PropertyField
                  key={descriptor.key}
                  descriptor={descriptor}
                  target={target}
                  onChange={onChange}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </aside>
  );
}

// ---- Column property panel ----

function ColumnPropertyPanel({
  column,
  tableId,
  colIndex,
  onChange,
}: {
  column: ColumnRecord;
  tableId: string;
  colIndex: number;
  onChange: (tableId: string, colIndex: number, key: string, value: unknown) => void;
}) {
  return (
    <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-5 overflow-auto px-4 py-4">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">列属性</h4>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Name</span>
            <input
              type="text"
              value={typeof column.name === 'string' ? column.name : ''}
              onChange={(e) => onChange(tableId, colIndex, 'name', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Label</span>
            <input
              type="text"
              value={typeof column.label === 'string' ? column.label : ''}
              onChange={(e) => onChange(tableId, colIndex, 'label', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Width</span>
            <input
              type="text"
              value={column.width == null ? '' : String(column.width)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') { onChange(tableId, colIndex, 'width', undefined); return; }
                const num = Number(raw);
                onChange(tableId, colIndex, 'width', Number.isFinite(num) && raw === String(num) ? num : raw);
              }}
              placeholder="自动"
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          {column.render != null ? (
            <div className="flex flex-col gap-1.5 text-sm text-[#334155]">
              <span>Render</span>
              <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-xs text-[#059669]">
                ✓ 已设置，在组件树中点选编辑
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function FieldPropertyPanel({
  field,
  formId,
  fieldIndex,
  onChange,
}: {
  field: FieldRecord;
  formId: string;
  fieldIndex: number;
  onChange: (formId: string, fieldIndex: number, key: string, value: unknown) => void;
}) {
  return (
    <div className="flex max-h-[calc(100vh-10rem)] flex-col gap-5 overflow-auto px-4 py-4">
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-[#64748B]">字段属性</h4>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Name</span>
            <input
              type="text"
              value={typeof field.name === 'string' ? field.name : ''}
              onChange={(e) => onChange(formId, fieldIndex, 'name', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Label</span>
            <input
              type="text"
              value={typeof field.label === 'string' ? field.label : ''}
              onChange={(e) => onChange(formId, fieldIndex, 'label', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Type</span>
            <input
              type="text"
              value={typeof field.type === 'string' ? field.type : ''}
              onChange={(e) => onChange(formId, fieldIndex, 'type', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-[#334155]">
            <span>Required</span>
            <input
              type="checkbox"
              checked={Boolean(field.required)}
              onChange={(e) => onChange(formId, fieldIndex, 'required', e.target.checked)}
              className="h-4 w-4 rounded border-[#CBD5E1]"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
            <span>Placeholder</span>
            <input
              type="text"
              value={typeof field.placeholder === 'string' ? field.placeholder : ''}
              onChange={(e) => onChange(formId, fieldIndex, 'placeholder', e.target.value || undefined)}
              className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
            />
          </label>
          <JsonField
            label="Options"
            value={field.options}
            onApply={(nextValue) => onChange(formId, fieldIndex, 'options', nextValue)}
          />
          <JsonField
            label="Default Value"
            value={field.defaultValue}
            onApply={(nextValue) => onChange(formId, fieldIndex, 'defaultValue', nextValue)}
          />
        </div>
      </section>
    </div>
  );
}

function PropertyField({
  descriptor,
  target,
  onChange,
}: {
  descriptor: PropertyDescriptor;
  target: ComponentSchema | PageSchema;
  onChange: (key: string, value: unknown) => void;
}) {
  const value = (target as Record<string, unknown>)[descriptor.key];

  // Route table columns to structured editor
  if (descriptor.key === 'columns' && (target as ComponentSchema).type === 'table') {
    return (
      <ColumnsEditor
        value={value}
        onApply={(nextValue) => onChange(descriptor.key, nextValue)}
      />
    );
  }

  if (descriptor.editor === 'readonly') {
    return <ReadonlyField label={descriptor.label} value={value} />;
  }

  if (descriptor.editor === 'json') {
    return (
      <JsonField
        label={descriptor.label}
        value={value}
        onApply={(nextValue) => onChange(descriptor.key, nextValue)}
      />
    );
  }

  if (descriptor.editor === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-[#334155]">
        <span>{descriptor.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(descriptor.key, event.target.checked)}
          className="h-4 w-4 rounded border-[#CBD5E1]"
        />
      </label>
    );
  }

  if (descriptor.editor === 'enum') {
    return (
      <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
        <span>{descriptor.label}</span>
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(event) => onChange(descriptor.key, event.target.value || undefined)}
          className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
        >
          <option value="">未设置</option>
          {descriptor.enumValues?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  if (descriptor.editor === 'number') {
    return (
      <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
        <span>{descriptor.label}</span>
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(event) => onChange(
            descriptor.key,
            event.target.value === '' ? undefined : Number(event.target.value),
          )}
          className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm text-[#334155]">
      <span>{descriptor.label}</span>
      <input
        type="text"
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        onChange={(event) => onChange(descriptor.key, event.target.value === '' ? undefined : event.target.value)}
        className="h-9 rounded-lg border border-[#CBD5E1] px-3 text-sm text-[#0F172A]"
      />
    </label>
  );
}

function ReadonlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm text-[#334155]">
      <span>{label}</span>
      <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-[#0F172A]">
        {value === undefined || value === null ? '—' : String(value)}
      </div>
    </div>
  );
}

function JsonField({
  label,
  value,
  onApply,
}: {
  label: string;
  value: unknown;
  onApply: (value: unknown) => void;
}) {
  const [draft, setDraft] = useState(() => (
    value === undefined ? '' : JSON.stringify(value, null, 2)
  ));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(value === undefined ? '' : JSON.stringify(value, null, 2));
    setError(null);
  }, [value]);

  return (
    <div className="flex flex-col gap-1.5 text-sm text-[#334155]">
      <span>{label}</span>
      <textarea
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        rows={6}
        className="min-h-24 rounded-lg border border-[#CBD5E1] px-3 py-2 font-mono text-xs text-[#0F172A]"
      />
      <div className="flex items-center justify-between gap-2">
        {error ? <span className="text-xs text-[#B91C1C]">{error}</span> : <span className="text-xs text-[#64748B]">复杂属性使用 JSON 编辑</span>}
        <button
          type="button"
          onClick={() => {
            try {
              onApply(draft.trim() === '' ? undefined : JSON.parse(draft));
              setError(null);
            } catch {
              setError('JSON 格式无效');
            }
          }}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-[#CBD5E1] px-3 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC]"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
