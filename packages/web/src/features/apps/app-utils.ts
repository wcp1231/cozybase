import type { AppMode } from '../../pages/content-slot';
import type { AppSummary, OverviewMetric, StableStatus } from './types';

const APP_TONES = [
  { iconBg: 'bg-[#4F46E5]', iconText: 'text-white' },
  { iconBg: 'bg-[#059669]', iconText: 'text-white' },
  { iconBg: 'bg-[#D97706]', iconText: 'text-white' },
  { iconBg: 'bg-[#7C3AED]', iconText: 'text-white' },
  { iconBg: 'bg-[#0F766E]', iconText: 'text-white' },
  { iconBg: 'bg-[#DB2777]', iconText: 'text-white' },
];

export function filterAppsByMode<T extends Pick<AppSummary, 'stableStatus' | 'hasDraft'>>(
  apps: T[],
  mode: AppMode,
): T[] {
  return apps.filter((app) => (mode === 'stable' ? app.stableStatus !== null : app.hasDraft));
}

export function matchesAppQuery(app: Pick<AppSummary, 'name' | 'description'>, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return `${app.name} ${app.description}`.toLowerCase().includes(normalized);
}

export function getAppInitials(name: string): string {
  const compact = name.replace(/[^a-zA-Z0-9\u4e00-\u9fff]+/g, ' ').trim();
  if (!compact) return 'AP';

  const parts = compact.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }

  const chars = Array.from(parts[0]);
  return chars.slice(0, 2).join('').toUpperCase();
}

export function getAppTone(name: string, stableStatus: StableStatus) {
  if (stableStatus === 'stopped') {
    return { iconBg: 'bg-[#CBD5E1]', iconText: 'text-[#475569]' };
  }

  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return APP_TONES[hash % APP_TONES.length];
}

export function getAppStatusLabel(app: Pick<AppSummary, 'stableStatus' | 'hasDraft'>, mode: AppMode): string {
  if (mode === 'stable') {
    return app.stableStatus === 'running' ? '运行中' : '已停止';
  }

  if (app.stableStatus === null) {
    return '全新草稿';
  }

  return '待发布';
}

export function getAppStatusClasses(app: Pick<AppSummary, 'stableStatus' | 'hasDraft'>, mode: AppMode): string {
  if (mode === 'stable') {
    return app.stableStatus === 'running'
      ? 'border-[#DCFCE7] bg-[#ECFDF5] text-[#166534]'
      : 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]';
  }

  return app.stableStatus === null
    ? 'border-[#E2E8F0] bg-[#F8FAFC] text-[#475569]'
    : 'border-[#FDE68A] bg-[#FEF3C7] text-[#92400E]';
}

export function buildHomeMetrics(apps: AppSummary[], mode: AppMode): OverviewMetric[] {
  if (mode === 'draft') {
    const draftApps = filterAppsByMode(apps, 'draft');
    const draftOnlyCount = draftApps.filter((app) => app.stableStatus === null).length;
    const updatesCount = draftApps.filter((app) => app.stableStatus !== null).length;
    const withUiCount = draftApps.filter((app) => app.has_ui).length;

    return [
      {
        label: '草稿应用',
        value: String(draftApps.length),
        meta: `${withUiCount} 个已配置界面`,
        tone: 'indigo',
      },
      {
        label: '全新草稿',
        value: String(draftOnlyCount),
        meta: '从未发布的新应用',
        tone: 'amber',
      },
      {
        label: '待发布更新',
        value: String(updatesCount),
        meta: '已有 Stable 版本的增量修改',
        tone: 'emerald',
      },
      {
        label: '待补 UI',
        value: String(Math.max(draftApps.length - withUiCount, 0)),
        meta: '还没有 pages.json 的草稿',
        tone: 'sky',
      },
    ];
  }

  const publishedApps = filterAppsByMode(apps, 'stable');
  const runningCount = publishedApps.filter((app) => app.stableStatus === 'running').length;
  const withDraftCount = publishedApps.filter((app) => app.hasDraft).length;
  const withUiCount = publishedApps.filter((app) => app.has_ui).length;

  return [
    {
      label: '已发布应用',
      value: String(publishedApps.length),
      meta: `${apps.length} 个应用总数`,
      tone: 'indigo',
    },
    {
      label: '运行中',
      value: String(runningCount),
      meta: runningCount === publishedApps.length ? '全部在线' : '可直接访问 Stable',
      tone: 'emerald',
    },
    {
      label: '待发布草稿',
      value: String(withDraftCount),
      meta: '这些应用还有未发布改动',
      tone: 'amber',
    },
    {
      label: '已配置界面',
      value: String(withUiCount),
      meta: '包含可渲染 UI 的应用',
      tone: 'sky',
    },
  ];
}
