import { clsx } from 'clsx';
import { Activity, LayoutGrid, PencilRuler, Sparkles } from 'lucide-react';
import type { OverviewMetric } from './types';

const toneClasses: Record<OverviewMetric['tone'], { icon: string; iconWrap: string }> = {
  indigo: { icon: 'text-[#4F46E5]', iconWrap: 'bg-[#EEF2FF]' },
  emerald: { icon: 'text-[#059669]', iconWrap: 'bg-[#ECFDF5]' },
  sky: { icon: 'text-[#2563EB]', iconWrap: 'bg-[#EFF6FF]' },
  amber: { icon: 'text-[#D97706]', iconWrap: 'bg-[#FFF7ED]' },
};

const toneIcons = {
  indigo: LayoutGrid,
  emerald: Activity,
  sky: Sparkles,
  amber: PencilRuler,
} satisfies Record<OverviewMetric['tone'], typeof LayoutGrid>;

export function OverviewCard({ metric }: { metric: OverviewMetric }) {
  const tone = toneClasses[metric.tone];
  const Icon = toneIcons[metric.tone];

  return (
    <article className="rounded-xl border border-[#E2E8F0] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={clsx('flex h-6 w-6 items-center justify-center rounded-[7px]', tone.iconWrap)}>
            <Icon className={clsx('h-3.5 w-3.5', tone.icon)} />
          </span>
          <span className="text-xs font-semibold text-[#334155]">{metric.label}</span>
        </div>
      </div>
      <div className='mt-2 font-["Outfit",sans-serif] text-[22px] font-bold text-[#0F172A]'>{metric.value}</div>
      <div className="mt-1 text-[11px] font-medium text-[#94A3B8]">{metric.meta}</div>
    </article>
  );
}
