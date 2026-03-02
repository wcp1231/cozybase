import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

export function CreateAppDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (appName: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
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
    if (!name.trim()) {
      setError('请输入 App ID。');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
        }),
      });

      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message = json?.error?.message ?? json?.data?.message ?? `HTTP ${response.status}`;
        throw new Error(message);
      }

      onCreated(name.trim());
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
        className="absolute inset-0 bg-[#00000066]"
        onClick={onClose}
      />

      <div className="relative z-10 flex w-full max-w-[560px] flex-col gap-6 rounded-[24px] bg-white p-6 shadow-[0_24px_80px_-28px_rgba(15,23,42,0.45)] md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className='m-0 font-["Outfit",sans-serif] text-[24px] font-extrabold text-[#18181B]'>创建新应用</h2>
            <p className="mt-1 text-sm text-[#71717A]">先创建一个 Draft 应用，再继续用 AI Builder 或代码完善它。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#F1F5F9] text-[#64748B] transition-colors hover:bg-[#E2E8F0]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <div className="mb-2 text-sm font-semibold text-[#334155]">App ID</div>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如 fitness-tracker"
              className="h-11 w-full rounded-xl border border-[#E2E8F0] bg-white px-4 text-sm text-[#0F172A] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#94A3B8]"
            />
            <div className="mt-2 text-xs text-[#94A3B8]">仅支持字母、数字、`-` 和 `_`。</div>
          </label>

          <label className="block">
            <div className="mb-2 text-sm font-semibold text-[#334155]">应用描述</div>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={6}
              placeholder="描述这个应用的目标、核心功能和希望 AI 帮你补齐的模块。"
              className="w-full resize-none rounded-xl border border-[#E2E8F0] bg-white px-4 py-3 text-sm leading-6 text-[#0F172A] outline-none transition-colors placeholder:text-[#A1A1AA] focus:border-[#94A3B8]"
            />
          </label>
        </div>

        {error && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">{error}</div>}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white px-5 text-sm font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            创建 Draft
          </button>
        </div>
      </div>
    </div>
  );
}
