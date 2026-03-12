import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import type { AppMode } from '../../pages/content-slot';
import { getAppInitials, getAppStatusClasses, getAppStatusLabel, getAppTone } from './app-utils';
import type { AppSummary } from './types';

export function AppCard({
  app,
  mode,
  to,
}: {
  app: AppSummary;
  mode: AppMode;
  to: string;
}) {
  const navigate = useNavigate();
  const tone = getAppTone(app.slug, app.stableStatus);
  const isStopped = app.stableStatus === 'stopped' && mode === 'stable';
  const showStatusBadge = !(mode === 'stable' && app.stableStatus === 'running');

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    navigate(to);
  };

  return (
    <article
      role="link"
      tabIndex={0}
      onClick={() => navigate(to)}
      onKeyDown={handleKeyDown}
      className={clsx(
        'h-full cursor-pointer rounded-[14px] border p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-20px_rgba(15,23,42,0.45)] focus:outline-none focus:ring-2 focus:ring-[#C7D2FE]',
        isStopped
          ? 'border-[#E2E8F0] bg-[#F8FAFC]'
          : 'border-[#E6EAF1] bg-white hover:border-[#D7DEEA]',
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={clsx(
              'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[10px] font-bold uppercase',
              tone.iconBg,
              tone.iconText,
            )}
          >
            {getAppInitials(app.displayName || app.slug)}
          </span>

          <div className="min-w-0 flex-1">
            <div className={clsx('flex min-w-0 items-start gap-2', mode === 'draft' ? 'justify-between' : undefined)}>
              <div className={clsx('truncate font-["Outfit",sans-serif] text-base font-bold leading-6', isStopped ? 'text-[#64748B]' : 'text-[#0F172A]')}>
                {app.displayName || app.slug}
              </div>
              {mode === 'draft' && showStatusBadge ? (
                <span
                  className={clsx(
                    'ml-2 inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[10px] font-medium tracking-[0.01em]',
                    getAppStatusClasses(app, mode),
                  )}
                >
                  {getAppStatusLabel(app, mode)}
                </span>
              ) : null}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {mode !== 'draft' && showStatusBadge && (
                <span
                  className={clsx(
                    'inline-flex h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold',
                    getAppStatusClasses(app, mode),
                  )}
                >
                  {getAppStatusLabel(app, mode)}
                </span>
              )}
              {!app.has_ui && (
                <span className="inline-flex h-6 items-center rounded-full border border-[#E2E8F0] bg-white px-2.5 text-[11px] font-semibold text-[#64748B]">
                  No UI
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className={clsx('mt-2.5 line-clamp-2 min-h-[36px] text-xs leading-[1.45]', isStopped ? 'text-[#94A3B8]' : 'text-[#64748B]')}>
        {app.description || '暂未填写应用描述。'}
      </p>
    </article>
  );
}

export function NewAppCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[114px] w-full flex-col items-start rounded-[14px] border border-dashed border-[#D9E1EC] bg-[#F8FAFC] p-3 text-left transition-colors hover:border-[#BEC9D9] hover:bg-white"
    >
      <div className="flex items-center gap-2">
        <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-[#E2E8F0] bg-white text-[#475569]">
          <Plus className="h-4 w-4" />
        </span>
        <span className='font-["Outfit",sans-serif] text-base font-bold text-[#334155]'>创建新应用</span>
      </div>
      <p className="mt-2.5 text-xs leading-[1.45] text-[#94A3B8]">创建一个新的 Draft 应用，再继续用 AI 或代码完善它。</p>
    </button>
  );
}
