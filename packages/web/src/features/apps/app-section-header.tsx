import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { clsx } from 'clsx';
import type { AppMode } from '../../pages/content-slot';
import { getAppInitials, getAppTone } from './app-utils';

interface AppSectionHeaderProps {
  mode: AppMode;
  appName?: string;
  appDisplayName?: string | null;
  appHomeTo?: string;
  stableStatus?: 'running' | 'stopped' | null;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  toggleSidebar: () => void;
  sidebarVisible: boolean;
  titleAddon?: ReactNode;
  actions?: ReactNode;
}

export function AppSectionHeader({
  mode,
  appName,
  appDisplayName,
  appHomeTo,
  stableStatus,
  breadcrumbs,
  toggleSidebar,
  sidebarVisible,
  titleAddon,
  actions,
}: AppSectionHeaderProps) {
  const title = appDisplayName || appName || '应用';
  const tone = getAppTone(appName ?? title, stableStatus ?? null);
  const badge = resolveStatusBadge(mode, stableStatus ?? null);

  return (
    <header className="border-b border-[#E7EBF2] bg-[#F3F5F9]">
      <div className="flex min-h-[52px] items-center justify-between gap-4 px-4 pt-4 pb-2 md:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-[#F8FAFC] md:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
            className="hidden h-10 w-10 items-center justify-center rounded-xl border border-[#E2E8F0] bg-white text-[#475569] shadow-sm transition-colors hover:bg-[#F8FAFC] md:inline-flex"
          >
            {sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>

          <div className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold uppercase', tone.iconBg, tone.iconText)}>
            {getAppInitials(title)}
          </div>

          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <div className='truncate font-["Outfit",sans-serif] text-[22px] font-extrabold text-[#18181B]'>
                {title}
              </div>
              {titleAddon}
              {badge ? (
                <span className={clsx('inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold', badge.className)}>
                  {badge.label}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>

      {breadcrumbs?.length ? (
        <div className="flex min-h-10 items-center gap-2 px-4 pb-2 text-xs md:px-8">
          {appHomeTo ? (
            <Link to={appHomeTo} className="truncate font-medium text-[#94A3B8] no-underline hover:text-[#64748B]">
              {title}
            </Link>
          ) : (
            <span className="truncate font-medium text-[#94A3B8]">{title}</span>
          )}
          {breadcrumbs.map((item, index) => (
            <div key={`${item.label}-${index}`} className="contents">
              <span className="text-[#CBD5E1]">/</span>
              {item.to ? (
                <Link to={item.to} className="truncate font-medium text-[#64748B] no-underline hover:text-[#334155]">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate font-semibold text-[#1E293B]">{item.label}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </header>
  );
}

function resolveStatusBadge(mode: AppMode, stableStatus: 'running' | 'stopped' | null) {
  if (mode === 'draft') {
    return { label: '草稿', className: 'bg-[#EEF2FF] text-[#4F46E5]' };
  }

  if (stableStatus === 'running') {
    return { label: '运行中', className: 'bg-[#ECFDF5] text-[#047857]' };
  }

  if (stableStatus === 'stopped') {
    return { label: '已停止', className: 'bg-[#F1F5F9] text-[#475569]' };
  }

  return null;
}
