export type StableStatus = 'running' | 'stopped' | null;

export interface AppSummary {
  name: string;
  description: string;
  stableStatus: StableStatus;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
  has_ui: boolean;
}

export interface AppInfo {
  name: string;
  description: string;
  stableStatus: StableStatus;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
}

export interface OverviewMetric {
  label: string;
  value: string;
  meta: string;
  tone: 'indigo' | 'emerald' | 'sky' | 'amber';
}
