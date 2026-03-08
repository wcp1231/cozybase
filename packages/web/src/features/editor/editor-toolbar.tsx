import { Loader2, PanelLeftClose, PanelLeftOpen, Pencil, RotateCcw, RotateCw, Save, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';

interface EditorToolbarProps {
  dirty: boolean;
  submitting: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  pagePanelOpen: boolean;
  onTogglePagePanel: () => void;
  propertyPanelOpen: boolean;
  onTogglePropertyPanel: () => void;
  compact?: boolean;
}

export function EditorToolbar({
  dirty,
  submitting,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  pagePanelOpen,
  onTogglePagePanel,
  propertyPanelOpen,
  onTogglePropertyPanel,
  compact = false,
}: EditorToolbarProps) {
  return (
    <div
      className={compact
        ? 'flex items-center justify-between gap-3'
        : 'flex h-12 items-center justify-between border-b border-[#E7EBF2] bg-white px-4 md:px-6'}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs text-[#64748B]">
          {dirty ? '有未保存修改' : ''}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onTogglePagePanel}
          disabled={submitting}
          className={clsx(
            'inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            pagePanelOpen
              ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]'
              : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]',
          )}
        >
          {pagePanelOpen ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
          页面和组件
        </button>
        <button
          type="button"
          onClick={onTogglePropertyPanel}
          disabled={submitting}
          className={clsx(
            'inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
            propertyPanelOpen
              ? 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8] hover:bg-[#DBEAFE]'
              : 'border-[#E2E8F0] bg-white text-[#334155] hover:bg-[#F8FAFC]',
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          属性面板
        </button>
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo || submitting}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo || submitting}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-[#E2E8F0] bg-white px-3 text-xs font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCw className="h-3.5 w-3.5" />
          Redo
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={submitting}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          保存
        </button>
      </div>
    </div>
  );
}
