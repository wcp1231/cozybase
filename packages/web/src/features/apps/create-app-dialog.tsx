import { useEffect, useState } from 'react';
import { Loader2, Rocket, X } from 'lucide-react';

export function CreateAppDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (slug: string, reconcileWarning?: string) => void;
}) {
  const [idea, setIdea] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setIdea('');
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!idea.trim()) {
      setError('请先描述你想创建的应用。');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/apps/create-with-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      }

      const json = await response.json();
      onCreated(json.data.slug, json.data.reconcileError ?? undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-[#02061773]"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-[520px] flex-col gap-6 rounded-[20px] bg-white p-8 shadow-[0_8px_40px_rgba(0,0,0,0.16)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className='m-0 font-["Outfit",sans-serif] text-[22px] font-extrabold text-[#18181B]'>创建新应用</h2>
            <p className="mt-1.5 text-[13px] text-[#71717A]">自由描述你的想法，AI 将自动生成应用。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[#F1F5F9] text-[#64748B] transition-colors hover:bg-[#E2E8F0]"
            aria-label="Close"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="space-y-5">
          <label className="block">
            <textarea
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              rows={5}
              placeholder="例如：我想创建一个待办事项应用，用户可以添加、编辑和删除任务，还能设置截止日期和优先级。"
              className="min-h-[148px] w-full resize-none rounded-[10px] border border-[#E2E8F0] bg-white px-[14px] py-3 text-sm leading-[1.6] text-[#0F172A] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#CBD5E1]"
            />
          </label>
        </div>

        {error && (
          <div className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white px-6 text-sm font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-[42px] items-center justify-center gap-2 rounded-[10px] bg-[#4F46E5] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" />
            )}
            AI 创建
          </button>
        </div>
      </div>
    </div>
  );
}
