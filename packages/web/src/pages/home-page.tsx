import { useMemo, useState } from 'react';
import { AppCard } from '../features/apps/app-card';
import { buildHomeMetrics, filterAppsByMode, matchesAppQuery } from '../features/apps/app-utils';
import { OverviewCard } from '../features/apps/overview-card';
import { StandardPageFrame } from '../features/shell/page-frame';
import { useAppContext } from './app-layout';
import { toAppPagePath } from './content-slot';

type HomeFilter = 'all' | 'running' | 'draft' | 'no-ui';

const homeFilters: { value: HomeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'draft', label: '待发布' },
  { value: 'no-ui', label: 'No UI' },
];

export function HomePage() {
  const { apps, appsLoading, appsError } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<HomeFilter>('all');

  const publishedApps = filterAppsByMode(apps, 'stable');
  const metrics = buildHomeMetrics(apps, 'stable');
  const filteredApps = useMemo(() => {
    return publishedApps
      .filter((app) => matchesAppQuery(app, searchQuery))
      .filter((app) => {
        if (selectedFilter === 'running') return app.stableStatus === 'running';
        if (selectedFilter === 'draft') return app.hasDraft;
        if (selectedFilter === 'no-ui') return !app.has_ui;
        return true;
      })
      .slice(0, 5);
  }, [publishedApps, searchQuery, selectedFilter]);

  return (
    <StandardPageFrame
      eyebrow="欢迎回来"
      title="我的应用"
      searchValue={searchQuery}
      onSearchChange={setSearchQuery}
    >
      {appsLoading ? (
        <StateCard message="正在加载首页数据..." />
      ) : appsError ? (
        <StateCard message={`加载失败：${appsError}`} danger />
      ) : (
        <div className="space-y-6">
          <section className="rounded-[14px] border border-[#E2E8F0] bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-[#64748B]">显示模块</span>
              {homeFilters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setSelectedFilter(filter.value)}
                  className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                    selectedFilter === filter.value
                      ? 'border-[#DDE4FF] bg-[#EEF2FF] text-[#3730A3]'
                      : 'border-[#E2E8F0] bg-white text-[#475569] hover:bg-[#F8FAFC]'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {metrics.map((metric) => (
                <OverviewCard key={metric.label} metric={metric} />
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <div className='font-["Outfit",sans-serif] text-lg font-bold text-[#18181B]'>常用应用</div>
            {filteredApps.length === 0 ? (
              <StateCard message={searchQuery ? '没有匹配的应用。' : '还没有已发布应用。'} />
            ) : (
              <div className="grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
                {filteredApps.map((app) => (
                  <AppCard
                    key={app.slug}
                    app={app}
                    mode="stable"
                    to={toAppPagePath(app.slug, undefined, 'stable')}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </StandardPageFrame>
  );
}

function StateCard({
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
