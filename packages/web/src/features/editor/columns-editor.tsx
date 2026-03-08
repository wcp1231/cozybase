import { Plus, Trash2 } from 'lucide-react';

interface ColumnItem {
  name: string;
  label: string;
  width?: number | string;
  render?: unknown;
  [key: string]: unknown;
}

interface ColumnsEditorProps {
  value: unknown;
  onApply: (value: unknown) => void;
}

export function ColumnsEditor({ value, onApply }: ColumnsEditorProps) {
  const columns: ColumnItem[] = Array.isArray(value)
    ? (value as ColumnItem[])
    : [];

  const updateColumn = (index: number, patch: Partial<ColumnItem>) => {
    const next = columns.map((col, i) => (i === index ? { ...col, ...patch } : col));
    onApply(next);
  };

  const deleteColumn = (index: number) => {
    const col = columns[index];
    if (col.render) {
      const confirmed = window.confirm(`列 "${col.label || col.name}" 含有自定义渲染组件，确定删除？`);
      if (!confirmed) return;
    }
    onApply(columns.filter((_, i) => i !== index));
  };

  const addColumn = () => {
    onApply([...columns, { name: 'newCol', label: '新列' }]);
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm text-[#334155]">
      <span>Columns</span>
      <div className="flex flex-col gap-2">
        {columns.map((col, index) => (
          <div
            key={index}
            className="rounded-lg border border-[#E2E8F0] bg-[#FCFDFE] px-3 py-2.5"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-[#64748B]">
                {col.name || `第 ${index + 1} 列`}
              </span>
              <button
                type="button"
                onClick={() => deleteColumn(index)}
                className="inline-flex h-5 w-5 items-center justify-center rounded text-[#94A3B8] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                aria-label="删除列"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-[#64748B]">Name</span>
                <input
                  type="text"
                  value={col.name ?? ''}
                  onChange={(e) => updateColumn(index, { name: e.target.value })}
                  className="h-7 flex-1 rounded border border-[#CBD5E1] px-2 text-xs text-[#0F172A]"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-[#64748B]">Label</span>
                <input
                  type="text"
                  value={col.label ?? ''}
                  onChange={(e) => updateColumn(index, { label: e.target.value })}
                  className="h-7 flex-1 rounded border border-[#CBD5E1] px-2 text-xs text-[#0F172A]"
                />
              </label>
              <label className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-[#64748B]">Width</span>
                <input
                  type="text"
                  value={col.width ?? ''}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const num = Number(raw);
                    updateColumn(index, {
                      width: raw === '' ? undefined : (Number.isFinite(num) && raw === String(num) ? num : raw),
                    });
                  }}
                  className="h-7 flex-1 rounded border border-[#CBD5E1] px-2 text-xs text-[#0F172A]"
                  placeholder="自动"
                />
              </label>
              {col.render ? (
                <div className="flex items-center gap-2 text-xs text-[#64748B]">
                  <span className="w-12 shrink-0">Render</span>
                  <span className="text-[#059669]">&#10003; 在组件树中编辑</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addColumn}
        className="mt-1 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#CBD5E1] text-xs font-medium text-[#64748B] transition-colors hover:border-[#94A3B8] hover:bg-[#F8FAFC] hover:text-[#334155]"
      >
        <Plus className="h-3.5 w-3.5" />
        添加列
      </button>
    </div>
  );
}
