import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppCard, NewAppCard } from '../features/apps/app-card';
import { CreateAppDialog } from '../features/apps/create-app-dialog';
import { filterAppsByMode, matchesAppQuery } from '../features/apps/app-utils';
import { StandardPageFrame } from '../features/shell/page-frame';
import { useAppContext } from './app-layout';
import { toAppPagePath } from './content-slot';

export function AppListPage() {
  const { apps, appsLoading, appsError, mode, refreshApps } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const navigate = useNavigate();

  // In draft (builder) mode, show ALL apps so users can manage everything.
  // In stable mode, only show apps that have a stable version.
  const filteredApps = mode === 'draft' ? apps : filterAppsByMode(apps, mode);
  const visibleApps = filteredApps.filter((app) => matchesAppQuery(app, searchQuery));
  const title = mode === 'stable' ? '应用列表' : '应用管理';
  const sectionTitle = mode === 'stable' ? '全部应用' : '全部应用';

  return (
    <>
      <StandardPageFrame
        title={title}
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
      >
        {appsLoading ? (
          <ListStateCard message="正在加载应用列表..." />
        ) : appsError ? (
          <ListStateCard message={`加载失败：${appsError}`} danger />
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className='font-["Outfit",sans-serif] text-lg font-bold text-[#18181B]'>{sectionTitle}</div>
                <div className="mt-1 text-xs font-semibold text-[#94A3B8]">共 {visibleApps.length} 个</div>
              </div>
            </div>

            {visibleApps.length === 0 && mode !== 'draft' ? (
              <ListStateCard message={searchQuery ? '没有匹配的应用。' : '当前没有可展示的应用。'} />
            ) : (
              <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                {visibleApps.map((app) => (
                  <AppCard
                    key={app.slug}
                    app={app}
                    mode={mode}
                    to={toAppPagePath(app.slug, undefined, mode)}
                  />
                ))}

                {mode === 'draft' && (
                  <NewAppCard onClick={() => setDialogOpen(true)} />
                )}
              </div>
            )}
          </div>
        )}
      </StandardPageFrame>

      <CreateAppDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={(slug, reconcileWarning) => {
          setDialogOpen(false);
          if (reconcileWarning) {
            console.warn(`[create-app] reconcile warning for '${slug}':`, reconcileWarning);
          }
          void refreshApps().then(() => {
            navigate(`/draft/apps/${slug}`);
          });
        }}
      />
    </>
  );
}

function ListStateCard({
  message,
  danger,
}: {
  message: string;
  danger?: boolean;
}) {
  return (
    <div className={`rounded-2xl border bg-white p-6 text-sm ${danger ? 'border-[#FECACA] text-[#B91C1C]' : 'border-[#E2E8F0] text-[#64748B]'}`}>
      {message}
    </div>
  );
}
