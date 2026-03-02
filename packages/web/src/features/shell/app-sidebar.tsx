import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import { Grid2x2, Hammer, Home, Settings } from 'lucide-react';
import { useAppContext } from '../../pages/app-layout';
import { toAppListPath, toModeHomePath } from '../../pages/content-slot';

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  const { mode } = useAppContext();
  const location = useLocation();
  const stableHomePath = toModeHomePath('stable');
  const stableAppsPath = toAppListPath('stable');
  const draftHomePath = toModeHomePath('draft');

  const isStableHome = location.pathname === stableHomePath;
  const isStableApps = location.pathname.startsWith(stableAppsPath);
  const isDraftApps = location.pathname.startsWith('/draft');

  return (
    <div
      className={clsx(
        'flex h-full w-full flex-col gap-7 overflow-auto bg-white',
        collapsed ? 'items-center p-[24px_12px]' : 'p-[24px_18px]',
      )}
    >
      <Link
        to={mode === 'stable' ? stableHomePath : draftHomePath}
        className={clsx(
          'flex h-10 items-center text-inherit no-underline',
          collapsed ? 'justify-center' : 'gap-2.5',
        )}
        title="CozyBase"
      >
        <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-[#18181B] font-["Outfit",sans-serif] text-lg font-extrabold text-white'>
          C
        </span>
        {!collapsed && (
          <span className='truncate font-["Outfit",sans-serif] text-xl font-extrabold tracking-[-0.02em] text-[#18181B]'>CozyBase</span>
        )}
      </Link>

      {mode === 'draft' && !collapsed && (
        <div className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md bg-[#EEF2FF] px-3 text-xs font-bold text-[#4F46E5]">
          <Hammer className="h-3.5 w-3.5" />
          Builder 模式
        </div>
      )}

      <nav className={clsx('flex flex-col gap-1', collapsed && 'w-full')}>
        {mode === 'stable' && (
          <SidebarNavLink
            collapsed={collapsed}
            active={isStableHome}
            to={stableHomePath}
            icon={<Home className="h-[18px] w-[18px]" />}
            label="首页"
          />
        )}
        <SidebarNavLink
          collapsed={collapsed}
          active={mode === 'stable' ? isStableApps : isDraftApps}
          to={mode === 'stable' ? stableAppsPath : draftHomePath}
          icon={<Grid2x2 className="h-[18px] w-[18px]" />}
          label="APP 列表"
        />
      </nav>

      <div className="min-h-0 flex-1" />

      <div className="flex flex-col gap-2 w-full">
        <div
          className={clsx(
            'flex h-[42px] rounded-[10px] text-sm font-semibold text-[#475569]',
            collapsed ? 'items-center justify-center px-0' : 'items-center gap-3 px-3.5',
          )}
          title={collapsed ? '设置' : undefined}
        >
          <Settings className="h-[18px] w-[18px]" />
          {!collapsed && <span>设置</span>}
        </div>
        <div className="h-px bg-[#E7EBF2]" />
        <Link
          to={mode === 'stable' ? draftHomePath : stableHomePath}
          title={collapsed ? (mode === 'stable' ? '进入构建器' : '返回首页') : undefined}
          className={clsx(
            'flex h-[42px] rounded-[10px] border border-[#E2E8F0] bg-[#F8FAFC] text-sm font-semibold text-[#475569] no-underline transition-colors hover:bg-white',
            collapsed ? 'items-center justify-center px-0' : 'items-center justify-center gap-2 px-3.5',
          )}
        >
          <Hammer className="h-[18px] w-[18px]" />
          {!collapsed && <span>{mode === 'stable' ? '进入构建器' : '返回首页'}</span>}
        </Link>
      </div>
    </div>
  );
}

function SidebarNavLink({
  collapsed,
  active,
  to,
  icon,
  label,
}: {
  collapsed: boolean;
  active: boolean;
  to: string;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={clsx(
        'flex h-[42px] rounded-[10px] border text-sm font-semibold no-underline transition-colors',
        active
          ? 'border-[#DDE4FF] bg-[#EEF2FF] text-[#3730A3]'
          : 'border-transparent bg-white text-[#475569] hover:bg-[#F8FAFC]',
        collapsed ? 'items-center justify-center px-0' : 'items-center gap-3 px-3.5',
      )}
    >
      {icon}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}
