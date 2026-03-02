import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAppContext } from './app-layout';
import { toAppListPath, toAppPagePath, type AppMode } from './content-slot';

type AppListTab = AppMode;

interface AppSummaryLike {
  name: string;
  stableStatus: 'running' | 'stopped' | null;
  hasDraft: boolean;
  has_ui?: boolean;
  description?: string;
}

function StateBadge({
  tab,
  stableStatus,
}: {
  tab: AppListTab;
  stableStatus: 'running' | 'stopped' | null;
}) {
  const label = tab === 'stable'
    ? stableStatus ?? 'stopped'
    : stableStatus === null ? 'draft (new)' : 'draft';
  const cls = tab === 'stable'
    ? stableStatus === 'running'
      ? 'bg-success-bg text-success-text'
      : 'bg-bg-muted text-text-secondary'
    : stableStatus === null
      ? 'bg-bg-muted text-text-secondary'
      : 'bg-warning-bg text-warning-text';

  return (
    <span
      className={clsx(
        'inline-block px-2 py-0.5 rounded-full text-xs font-medium',
        cls,
      )}
    >
      {label}
    </span>
  );
}

export function filterAppsByTab<T extends AppSummaryLike>(apps: T[], tab: AppListTab): T[] {
  return apps.filter((app) => {
    if (tab === 'stable') {
      return app.stableStatus !== null;
    }
    return app.hasDraft;
  });
}

export function AppListPage() {
  const { apps, appsLoading, appsError, mode } = useAppContext();

  const visibleApps = useMemo(() => filterAppsByTab(apps, mode), [apps, mode]);

  if (appsLoading) {
    return <div className="p-6 text-text-muted">Loading apps...</div>;
  }

  if (appsError) {
    return <div className="p-6 text-danger">Error: {appsError}</div>;
  }

  return (
    <div className="w-full max-w-5xl">

      <div className="mb-5 flex items-center gap-2">
        <Link
          to={toAppListPath('stable')}
          className={clsx(
            'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold no-underline transition-colors',
            mode === 'stable'
              ? 'border-[#DDE4FF] bg-[#FFFFFF] text-[#475569]'
              : 'border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:bg-[#F8FAFC]',
          )}
        >
          Stable
        </Link>
        <Link
          to={toAppListPath('draft')}
          className={clsx(
            'inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold no-underline transition-colors',
            mode === 'draft'
              ? 'border-[#DDE4FF] bg-[#EEF2FF] text-[#3730A3]'
              : 'border-[#E2E8F0] bg-[#FFFFFF] text-[#64748B] hover:bg-[#F8FAFC]',
          )}
        >
          Draft
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="text-text-muted border border-border rounded-md p-6">
          No apps found.
        </div>
      ) : visibleApps.length === 0 ? (
        <div className="rounded-xl border border-[#E2E8F0] bg-white p-6 text-sm text-[#64748B]">
          No {mode} apps found.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleApps.map((app) => (
            <Link
              key={app.name}
              to={toAppPagePath(app.name, undefined, mode)}
              className="no-underline text-inherit"
            >
              <div className="bg-bg border border-border rounded-md p-4 cursor-pointer transition-shadow hover:shadow-md h-full">
                <div className="flex justify-between items-center mb-2 gap-2">
                  <span className="text-base font-semibold text-text">
                    {app.name}
                  </span>
                  <div className="flex gap-1.5 items-center shrink-0">
                    {!app.has_ui && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-error-bg text-error-text">
                        No UI
                      </span>
                    )}
                    <StateBadge tab={mode} stableStatus={app.stableStatus} />
                  </div>
                </div>
                <p className="text-sm text-text-muted m-0 leading-normal">
                  {app.description || 'No description'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
