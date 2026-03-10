export type DelegatedTaskType = 'create' | 'develop' | 'operate';

export type DelegatedTaskTarget = 'builder' | 'operator';

export type DelegatedTaskStatus = 'queued' | 'running' | 'completed' | 'failed';

export type AppSummaryStatus = 'running' | 'stopped' | 'draft-only';

export interface DelegatedTask {
  taskId: string;
  appSlug: string;
  type: DelegatedTaskType;
  target: DelegatedTaskTarget;
  instruction: string;
  status: DelegatedTaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  summary?: string;
  error?: string;
}

export interface AppSummary {
  slug: string;
  displayName: string;
  status: AppSummaryStatus;
}

export interface AppPageSummary {
  path: string;
  title: string;
}

export interface AppFunctionSummary {
  name: string;
  methods: string[];
}

export interface AppDetail {
  slug: string;
  displayName: string;
  description: string;
  status: AppSummaryStatus;
  currentVersion: number;
  publishedVersion: number;
  pages: AppPageSummary[];
  functions: AppFunctionSummary[];
}

export interface AppLifecycleResult {
  slug: string;
  displayName: string;
  status: AppSummaryStatus;
}

export interface DeleteAppResult {
  slug: string;
  deleted: true;
}

export interface DelegatedToolResult {
  taskId: string;
  appSlug: string;
  status: Extract<DelegatedTaskStatus, 'queued' | 'running'>;
}

export interface QueueStatus {
  key: string;
  appSlug: string;
  target: DelegatedTaskTarget;
  runningTaskId: string | null;
  queuedTaskIds: string[];
  tasks: DelegatedTask[];
}

export type CallApiFn = (path: string, options?: RequestInit) => Promise<Response>;

export interface CozyBaseActionContext {
  listApps(): Promise<AppSummary[]>;
  getAppDetail(appName: string): Promise<AppDetail>;
  startApp(appName: string): Promise<AppLifecycleResult>;
  stopApp(appName: string): Promise<AppLifecycleResult>;
  deleteApp(appName: string): Promise<DeleteAppResult>;
  createApp(idea: string): Promise<DelegatedToolResult>;
  developApp(appName: string, instruction: string): Promise<DelegatedToolResult>;
  operateApp(appName: string, instruction: string): Promise<DelegatedToolResult>;
}
