import { Fragment, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Database, FileCode2, FolderTree, History, Loader2, Pencil, Play, RefreshCw, Save, Square, Trash2, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppContext } from './app-layout';
import { getDefaultPagePath, toAppListPath, toAppPagePath, type AppMode } from './content-slot';
import { AppSectionHeader } from '../features/apps/app-section-header';

type ConsoleTab = 'errors' | 'schedules' | 'database' | 'source';
type ErrorSourceType = 'http_function' | 'schedule' | 'build';

interface AppConsoleOverview {
  app_status: {
    stable_running: boolean;
    stable_status: 'running' | 'stopped' | null;
    current_version: number;
    published_version: number;
  };
  error_summary: {
    total_24h: number;
    by_source: Partial<Record<ErrorSourceType, number>>;
    latest?: {
      source: ErrorSourceType;
      message: string;
      created_at: string;
    };
  };
  schedules_summary: {
    total: number;
    healthy: number;
    failing: number;
    failing_names: string[];
  };
}

interface AppConsoleErrorItem {
  source_type: ErrorSourceType;
  source_detail: string | null;
  error_code: string | null;
  error_message: string;
  stack_trace: string | null;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

interface AppConsoleScheduleRun {
  id: number;
  runtime_mode: AppMode;
  trigger_mode: 'auto' | 'manual';
  status: 'running' | 'success' | 'error' | 'timeout' | 'skipped';
  function_ref: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

interface AppConsoleScheduleItem {
  name: string;
  cron: string;
  enabled: boolean;
  function: string;
  concurrency: 'skip' | 'queue' | 'parallel';
  timeout: number;
  timezone: string;
  next_run: string | null;
  last_run: AppConsoleScheduleRun | null;
}

type DbSchemaMap = Record<
  string,
  {
    columns: Array<{ name: string; type: string; notnull: number; pk: number }>;
  }
>;

interface AppSourceFile {
  path: string;
  content: string;
  immutable: boolean;
}

interface SourceFeedback {
  tone: 'success' | 'error';
  message: string;
}

export function AppConsolePage() {
  const {
    mode,
    appName,
    app,
    appLoading,
    appError,
    pagesJson,
    refreshApp,
    refreshApps,
    toggleSidebar,
    sidebarVisible,
  } = useAppContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appHomeTo = appName
    ? toAppPagePath(appName, getDefaultPagePath(pagesJson?.pages ?? []), mode)
    : undefined;

  const sourceTabEnabled = mode === 'draft';
  const requestedTab = parseConsoleTab(searchParams.get('tab'));
  const activeTab = requestedTab === 'source' && !sourceTabEnabled ? 'errors' : requestedTab;
  const errorFilter = parseErrorSource(searchParams.get('source'));
  const errorPage = parsePositiveInteger(searchParams.get('page'), 1);
  const errorLimit = 20;
  const errorOffset = (errorPage - 1) * errorLimit;

  const [overview, setOverview] = useState<AppConsoleOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [errors, setErrors] = useState<AppConsoleErrorItem[]>([]);
  const [errorsLoading, setErrorsLoading] = useState(false);
  const [expandedError, setExpandedError] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<AppConsoleScheduleItem[]>([]);
  const [schedulesLoading, setSchedulesLoading] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<string | null>(null);
  const [scheduleRuns, setScheduleRuns] = useState<AppConsoleScheduleRun[]>([]);
  const [scheduleRunsLoading, setScheduleRunsLoading] = useState(false);
  const [triggeringSchedule, setTriggeringSchedule] = useState<string | null>(null);
  const [databaseLoading, setDatabaseLoading] = useState(false);
  const [dbSchema, setDbSchema] = useState<DbSchemaMap>({});
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableRows, setTableRows] = useState<Record<string, unknown>[]>([]);
  const [tableMeta, setTableMeta] = useState<{ total: number; limit: number; offset: number } | null>(null);
  const [sqlText, setSqlText] = useState('SELECT name FROM sqlite_master WHERE type = "table" ORDER BY name;');
  const [sqlRunning, setSqlRunning] = useState(false);
  const [sqlResult, setSqlResult] = useState<{ columns: string[]; rows: unknown[][]; rowCount: number } | null>(null);
  const [databaseError, setDatabaseError] = useState<string | null>(null);
  const [sourceFiles, setSourceFiles] = useState<AppSourceFile[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null);
  const [sourceEditMode, setSourceEditMode] = useState(false);
  const [sourceDraftContent, setSourceDraftContent] = useState('');
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceFeedback, setSourceFeedback] = useState<SourceFeedback | null>(null);
  const [appActionBusy, setAppActionBusy] = useState<'start' | 'stop' | 'delete' | null>(null);
  const [appActionError, setAppActionError] = useState<string | null>(null);

  const tableNames = getVisibleDatabaseTables(dbSchema);
  const selectedSourceFile = sourceFiles.find((file) => file.path === selectedSourcePath) ?? null;
  const sourceTree = buildSourceTree(sourceFiles);
  const hasSourceChanges = !!selectedSourceFile && sourceDraftContent !== selectedSourceFile.content;

  useEffect(() => {
    if (!appName) return;
    void loadOverview(appName, mode, setOverview, setOverviewLoading);
  }, [appName, mode]);

  useEffect(() => {
    if (!appName || activeTab !== 'errors') return;
    void loadErrors(appName, mode, errorLimit, errorOffset, errorFilter, setErrors, setErrorsLoading);
  }, [activeTab, appName, mode, errorFilter, errorOffset]);

  useEffect(() => {
    if (!appName || activeTab !== 'schedules') return;
    void loadSchedules(appName, mode, setSchedules, setSchedulesLoading, setSelectedSchedule);
  }, [activeTab, appName, mode]);

  useEffect(() => {
    if (!appName || activeTab !== 'schedules' || !selectedSchedule) return;
    void loadScheduleRuns(appName, mode, selectedSchedule, setScheduleRuns, setScheduleRunsLoading);
  }, [activeTab, appName, mode, selectedSchedule]);

  useEffect(() => {
    if (!appName || activeTab !== 'database') return;
    void loadDatabaseSchema(appName, mode, setDbSchema, setSelectedTable, setDatabaseLoading, setDatabaseError);
  }, [activeTab, appName, mode]);

  useEffect(() => {
    if (!appName || activeTab !== 'database' || !selectedTable) return;
    void loadTableRows(appName, mode, selectedTable, setTableRows, setTableMeta, setDatabaseLoading, setDatabaseError);
  }, [activeTab, appName, mode, selectedTable]);

  useEffect(() => {
    if (!appName || activeTab !== 'source' || !sourceTabEnabled) return;
    void loadSourceFiles(appName, setSourceFiles, setSelectedSourcePath, setSourceLoading, setSourceError);
  }, [activeTab, appName, sourceTabEnabled]);

  useEffect(() => {
    if (!selectedSourceFile || sourceEditMode) return;
    setSourceDraftContent(selectedSourceFile.content);
  }, [selectedSourceFile, sourceEditMode]);

  const handleStableLifecycle = async (nextAction: 'start' | 'stop') => {
    if (!appName) return;

    setAppActionBusy(nextAction);
    setAppActionError(null);

    try {
      const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}/${nextAction}`, { method: 'POST' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await Promise.all([
        refreshApp(),
        refreshApps(),
        loadOverview(appName, mode, setOverview, setOverviewLoading),
      ]);
      if (activeTab === 'schedules') {
        await loadSchedules(appName, mode, setSchedules, setSchedulesLoading, setSelectedSchedule);
      }
    } catch (error) {
      setAppActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAppActionBusy(null);
    }
  };

  const handleDeleteApp = async () => {
    if (!appName) return;

    const confirmed = window.confirm(
      mode === 'draft'
        ? `确定删除 Draft APP「${app?.displayName || appName}」吗？这会删除整个 APP。`
        : `确定删除 Stable APP「${app?.displayName || appName}」吗？`,
    );
    if (!confirmed) return;

    setAppActionBusy('delete');
    setAppActionError(null);

    try {
      const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}`, { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await refreshApps();
      navigate(toAppListPath(mode));
    } catch (error) {
      setAppActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setAppActionBusy(null);
    }
  };

  if (!appName) {
    return <ConsoleEmptyState message="缺少 APP 名称。" />;
  }

  if (appLoading) {
    return <ConsoleLoading />;
  }

  if (appError) {
    return <ConsoleEmptyState message={appError} />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F3F5F9]">
      <AppSectionHeader
        mode={mode}
        appName={appName}
        appDisplayName={app?.displayName}
        appHomeTo={appHomeTo}
        stableStatus={app?.stableStatus ?? null}
        breadcrumbs={[{ label: 'Console' }]}
        toggleSidebar={toggleSidebar}
        sidebarVisible={sidebarVisible}
        actions={mode === 'stable' ? (
          <>
            {app?.stableStatus === 'running' ? (
              <button
                type="button"
                onClick={() => void handleStableLifecycle('stop')}
                disabled={appActionBusy !== null}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {appActionBusy === 'stop' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                停止
              </button>
            ) : null}
            {app?.stableStatus === 'stopped' ? (
              <>
                <button
                  type="button"
                  onClick={() => void handleStableLifecycle('start')}
                  disabled={appActionBusy !== null}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appActionBusy === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  启动
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteApp()}
                  disabled={appActionBusy !== null}
                  className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {appActionBusy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  删除
                </button>
              </>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            onClick={() => void handleDeleteApp()}
            disabled={appActionBusy !== null}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#FECACA] bg-white px-4 text-sm font-semibold text-[#B91C1C] transition-colors hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {appActionBusy === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            删除 APP
          </button>
        )}
      />

      <div className="flex h-11 items-end gap-4 border-b border-[#E7EBF2] bg-[#F3F5F9] px-4 md:px-8">
        <ConsoleUnderlineTab
          active={activeTab === 'errors'}
          onClick={() => setSearchParams({ tab: 'errors', ...(errorFilter ? { source: errorFilter } : {}) })}
          label="错误日志"
        />
        <ConsoleUnderlineTab
          active={activeTab === 'schedules'}
          onClick={() => setSearchParams({ tab: 'schedules' })}
          label="定时任务"
        />
        <ConsoleUnderlineTab
          active={activeTab === 'database'}
          onClick={() => setSearchParams({ tab: 'database' })}
          label="数据库"
        />
        {sourceTabEnabled ? (
          <ConsoleUnderlineTab
            active={activeTab === 'source'}
            onClick={() => setSearchParams({ tab: 'source' })}
            label="源码"
          />
        ) : null}
      </div>

      {appActionError ? (
        <div className="mx-4 mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C] md:mx-8">
          {appActionError}
        </div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto bg-white">
        <div className="min-h-full bg-white">
          <div className="bg-[#F8FAFC] px-4 py-5 md:px-7 md:py-7">
            {activeTab === 'errors' ? (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <ConsoleSummaryCard
                    title="24 小时总错误数"
                    value={overviewLoading ? '...' : String(overview?.error_summary.total_24h ?? 0)}
                    tone={(overview?.error_summary.total_24h ?? 0) > 0 ? 'danger' : 'neutral'}
                  />
                  <ConsoleSummaryCard
                    title="HTTP 函数错误"
                    value={overviewLoading ? '...' : String(overview?.error_summary.by_source.http_function ?? 0)}
                    tone={(overview?.error_summary.by_source.http_function ?? 0) > 0 ? 'danger' : 'neutral'}
                  />
                  <ConsoleSummaryCard
                    title="定时任务失败"
                    value={overviewLoading ? '...' : String(overview?.error_summary.by_source.schedule ?? 0)}
                    tone={(overview?.error_summary.by_source.schedule ?? 0) > 0 ? 'danger' : 'neutral'}
                  />
                  <ConsoleSummaryCard
                    title="构建异常"
                    value={overviewLoading ? '...' : String(overview?.error_summary.by_source.build ?? 0)}
                    tone={(overview?.error_summary.by_source.build ?? 0) > 0 ? 'danger' : 'neutral'}
                  />
                </div>

                <section className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                  <div className="flex min-h-10 flex-wrap items-center justify-between gap-3 border-b border-[#E7EBF2] bg-[#F8FAFC] px-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ConsoleFilterChip
                        active={errorFilter === null}
                        onClick={() => setSearchParams({ tab: 'errors' })}
                        label="全部"
                      />
                      <ConsoleFilterChip
                        active={errorFilter === 'http_function'}
                        onClick={() => setSearchParams({ tab: 'errors', source: 'http_function' })}
                        label="HTTP"
                      />
                      <ConsoleFilterChip
                        active={errorFilter === 'schedule'}
                        onClick={() => setSearchParams({ tab: 'errors', source: 'schedule' })}
                        label="定时任务"
                      />
                      <ConsoleFilterChip
                        active={errorFilter === 'build'}
                        onClick={() => setSearchParams({ tab: 'errors', source: 'build' })}
                        label="构建"
                      />
                    </div>

                    <div className="flex items-center gap-2 text-xs text-[#64748B]">
                      <span>最近错误</span>
                      {(errorPage > 1 || errors.length >= errorLimit) && (
                        <>
                          <button
                            type="button"
                            disabled={errorPage <= 1}
                            onClick={() => {
                              const nextPage = Math.max(1, errorPage - 1);
                              setSearchParams({
                                tab: 'errors',
                                page: String(nextPage),
                                ...(errorFilter ? { source: errorFilter } : {}),
                              });
                            }}
                            className="rounded-md border border-[#E2E8F0] px-2 py-0.5 text-[#475569] disabled:opacity-40"
                          >
                            上一页
                          </button>
                          <span>第 {errorPage} 页</span>
                          <button
                            type="button"
                            disabled={errors.length < errorLimit}
                            onClick={() => {
                              const nextPage = errorPage + 1;
                              setSearchParams({
                                tab: 'errors',
                                page: String(nextPage),
                                ...(errorFilter ? { source: errorFilter } : {}),
                              });
                            }}
                            className="rounded-md border border-[#E2E8F0] px-2 py-0.5 text-[#475569] disabled:opacity-40"
                          >
                            下一页
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {errorsLoading ? (
                    <div className="p-5">
                      <PanelPlaceholder label="加载错误列表中..." />
                    </div>
                  ) : errors.length === 0 ? (
                    <div className="p-5">
                      <PanelPlaceholder label="当前过滤条件下没有错误记录。" />
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold tracking-[0.02em] text-[#94A3B8]">
                          <tr>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">错误来源</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">错误编码</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">错误信息</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">次数</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">更新时间</th>
                          </tr>
                        </thead>
                        <tbody>
                          {errors.map((error) => {
                            const errorKey = `${error.created_at}:${error.source_detail ?? error.error_message}`;
                            const expanded = expandedError === errorKey;

                            return (
                              <Fragment key={errorKey}>
                                <tr
                                  className="cursor-pointer transition-colors hover:bg-[#FCFCFD]"
                                  onClick={() => setExpandedError(expanded ? null : errorKey)}
                                >
                                  <td className="h-11 border-b border-[#F1F5F9] px-4 text-[#475569]">
                                    <div className="flex items-center gap-2">
                                      <span className={clsx('h-2.5 w-2.5 rounded-full', sourceDotClass(error.source_type))} />
                                      <span className="text-[13px] font-medium">{sourceLabel(error.source_type)}</span>
                                    </div>
                                  </td>
                                  <td className="h-11 border-b border-[#F1F5F9] px-4 text-[12px] text-[#EF4444]">{error.error_code ?? '-'}</td>
                                  <td className="h-11 border-b border-[#F1F5F9] px-4">
                                    <div className="text-[13px] font-medium text-[#0F172A]">{error.error_message}</div>
                                    <div className="mt-0.5 text-[12px] text-[#94A3B8]">{error.source_detail ?? '无来源详情'}</div>
                                  </td>
                                  <td className="h-11 border-b border-[#F1F5F9] px-4 text-[12px] font-semibold text-[#EF4444]">{error.occurrence_count}</td>
                                  <td className="h-11 border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">{formatDateTime(error.updated_at)}</td>
                                </tr>
                                {expanded && error.stack_trace ? (
                                  <tr>
                                    <td colSpan={5} className="bg-[#FCFCFD] px-4 py-3">
                                      <pre className="overflow-auto rounded-[8px] bg-[#111827] p-3 text-xs leading-6 text-[#E2E8F0]">
                                        {error.stack_trace}
                                      </pre>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === 'schedules' ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#4F46E5]" />
                  <h2 className='font-["Outfit",sans-serif] text-[15px] font-bold text-[#18181B]'>任务列表</h2>
                </div>

                <section className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">

                  {schedulesLoading ? (
                    <div className="p-5">
                      <PanelPlaceholder label="加载 Schedule 状态中..." />
                    </div>
                  ) : schedules.length === 0 ? (
                    <div className="p-5">
                      <PanelPlaceholder label="该 APP 没有声明 Schedule。" />
                    </div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold tracking-[0.02em] text-[#94A3B8]">
                          <tr>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">任务名称</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">函数映射</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">状态</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">上次运行</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4">下次执行</th>
                            <th className="h-10 border-b border-[#E7EBF2] px-4 text-right">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {schedules.map((schedule) => {
                            const status = schedule.last_run?.status ?? (schedule.enabled ? 'idle' : 'disabled');
                            const statusTone = status === 'error' || status === 'timeout'
                              ? 'danger'
                              : status === 'success' || status === 'idle'
                                ? 'success'
                                : 'neutral';

                            return (
                              <tr
                                key={schedule.name}
                                className={clsx(
                                  'transition-colors hover:bg-[#FCFCFD]',
                                  selectedSchedule === schedule.name && 'bg-[#F8FAFF]',
                                )}
                                onClick={() => setSelectedSchedule(schedule.name)}
                              >
                                <td className="h-12 border-b border-[#F1F5F9] px-4 text-[13px] font-medium text-[#0F172A]">{schedule.name}</td>
                                <td className="h-12 border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">{schedule.function}</td>
                                <td className="h-12 border-b border-[#F1F5F9] px-4">
                                  <StatusPill value={status} tone={statusTone} />
                                </td>
                                <td className="h-12 border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">
                                  {schedule.last_run ? formatDateTime(schedule.last_run.started_at) : '未运行'}
                                </td>
                                <td className="h-12 border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">
                                  {schedule.next_run ? formatDateTime(schedule.next_run) : mode === 'draft' ? '仅 Stable 自动运行' : '暂无'}
                                </td>
                                <td className="h-12 border-b border-[#F1F5F9] px-4 text-right">
                                  <button
                                    type="button"
                                    disabled={triggeringSchedule !== null}
                                    onClick={async (event) => {
                                      event.stopPropagation();
                                      setSelectedSchedule(schedule.name);
                                      setTriggeringSchedule(schedule.name);
                                      try {
                                        const response = await fetch(`/${mode}/apps/${encodeURIComponent(appName)}/schedule/${encodeURIComponent(schedule.name)}/trigger`, {
                                          method: 'POST',
                                        });
                                        if (!response.ok) {
                                          throw new Error(`HTTP ${response.status}`);
                                        }
                                        await Promise.all([
                                          loadOverview(appName, mode, setOverview, setOverviewLoading),
                                          loadSchedules(appName, mode, setSchedules, setSchedulesLoading, setSelectedSchedule),
                                          loadScheduleRuns(appName, mode, schedule.name, setScheduleRuns, setScheduleRunsLoading),
                                        ]);
                                      } catch (error) {
                                        window.alert(error instanceof Error ? error.message : String(error));
                                      } finally {
                                        setTriggeringSchedule(null);
                                      }
                                    }}
                                    className="inline-flex h-7 items-center justify-center rounded-md border border-[#E2E8F0] px-2.5 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                                  >
                                    {triggeringSchedule === schedule.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <History className="h-4 w-4 text-[#64748B]" />
                    <h2 className='font-["Outfit",sans-serif] text-[15px] font-bold text-[#18181B]'>运行历史</h2>
                    {selectedSchedule ? <span className="text-xs text-[#94A3B8]">{selectedSchedule}</span> : null}
                  </div>

                  <div className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                    {scheduleRunsLoading ? (
                      <PanelPlaceholder label="加载运行历史中..." />
                    ) : !selectedSchedule ? (
                      <PanelPlaceholder label="左侧选择一个定时任务。" />
                    ) : scheduleRuns.length === 0 ? (
                      <PanelPlaceholder label="该定时任务暂无运行记录。" />
                    ) : (
                      <table className="min-w-full border-collapse text-sm">
                        <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold tracking-[0.02em] text-[#94A3B8]">
                          <tr>
                            <th className="h-9 border-b border-[#E7EBF2] px-4">函数名称</th>
                            <th className="h-9 border-b border-[#E7EBF2] px-4">开始时间</th>
                            <th className="h-9 border-b border-[#E7EBF2] px-4">耗时</th>
                            <th className="h-9 border-b border-[#E7EBF2] px-4">触发</th>
                            <th className="h-9 border-b border-[#E7EBF2] px-4">状态</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scheduleRuns.map((run) => (
                            <tr key={run.id}>
                              <td className="h-[38px] border-b border-[#F1F5F9] px-4 text-[12px] text-[#0F172A]">{run.function_ref}</td>
                              <td className="h-[38px] border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">{formatDateTime(run.started_at)}</td>
                              <td className="h-[38px] border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">{run.duration_ms !== null ? `${run.duration_ms}ms` : '-'}</td>
                              <td className="h-[38px] border-b border-[#F1F5F9] px-4 text-[12px] text-[#64748B]">{run.trigger_mode}</td>
                              <td className="h-[38px] border-b border-[#F1F5F9] px-4">
                                <div className="flex items-center gap-2">
                                  <StatusPill
                                    value={run.status}
                                    tone={run.status === 'error' || run.status === 'timeout' ? 'danger' : run.status === 'success' ? 'success' : 'neutral'}
                                  />
                                  {run.error_message ? <span className="truncate text-[11px] text-[#EF4444]">{run.error_message}</span> : null}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </section>
              </div>
            ) : null}

            {activeTab === 'database' ? (
              <div className="grid gap-4 xl:grid-cols-[200px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                  <div className="border-b border-[#E7EBF2] px-3 py-3 text-sm font-semibold text-[#0F172A]">数据表</div>
                  <div className="mt-2 space-y-1">
                    {databaseLoading && tableNames.length === 0 ? (
                      <PanelPlaceholder label="加载表结构中..." compact />
                    ) : tableNames.length === 0 ? (
                      <PanelPlaceholder label="暂无数据表。" compact />
                    ) : (
                      tableNames.map((tableName) => (
                        <button
                          key={tableName}
                          type="button"
                          onClick={() => setSelectedTable(tableName)}
                          className={clsx(
                            'flex w-full items-center justify-between rounded-none px-3 py-2.5 text-left text-sm transition-colors',
                            selectedTable === tableName
                              ? 'bg-[#F8FAFF] font-semibold text-[#4F46E5]'
                              : 'text-[#475569] hover:bg-[#F8FAFC]',
                          )}
                        >
                          <span className="truncate">{tableName}</span>
                          <span className="text-xs text-[#94A3B8]">{dbSchema[tableName]?.columns.length ?? 0}</span>
                        </button>
                      ))
                    )}
                  </div>
                </aside>

                <section className="space-y-5">
                  <div className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="px-4 py-4">
                        <h2 className='font-["Outfit",sans-serif] text-[15px] font-bold text-[#18181B]'>
                          {selectedTable ?? '数据库预览'}
                        </h2>
                        <p className="mt-1 text-xs text-[#94A3B8]">
                          {selectedTable ? `${tableMeta?.total ?? tableRows.length} 行` : '选择一张表查看数据'}
                        </p>
                      </div>
                      <div className="px-4 py-4">
                        <button
                          type="button"
                          disabled
                          className="inline-flex h-7 items-center rounded-md bg-[#4F46E5] px-2.5 text-xs font-semibold text-white opacity-60"
                        >
                          + 添加行
                        </button>
                      </div>
                    </div>

                    {databaseError ? (
                      <div className="mx-4 mb-4 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                        {databaseError}
                      </div>
                    ) : (
                      <div className="overflow-auto border-t border-[#E7EBF2]">
                        <DataTable rows={tableRows} />
                      </div>
                    )}
                  </div>

                  <details className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                    <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-[#334155]">高级 SQL</summary>
                    <div className="border-t border-[#E7EBF2] p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm text-[#64748B]">直接复用 `_db/sql` 执行诊断查询。</p>
                        <button
                          type="button"
                          disabled={sqlRunning}
                          onClick={async () => {
                            setSqlRunning(true);
                            setDatabaseError(null);
                            try {
                              const response = await fetch(`/${mode}/apps/${encodeURIComponent(appName)}/fn/_db/sql`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ sql: sqlText }),
                              });
                              const payload = await response.json();
                              if (!response.ok) {
                                throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
                              }
                              setSqlResult(payload.data ?? null);
                            } catch (error) {
                              setSqlResult(null);
                              setDatabaseError(error instanceof Error ? error.message : String(error));
                            } finally {
                              setSqlRunning(false);
                            }
                          }}
                          className="inline-flex h-8 items-center gap-2 rounded-md bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                        >
                          {sqlRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}
                          执行 SQL
                        </button>
                      </div>

                      <textarea
                        value={sqlText}
                        onChange={(event) => setSqlText(event.target.value)}
                        className="mt-3 h-32 w-full rounded-[10px] border border-[#D7DEEA] bg-[#F8FAFC] p-4 font-mono text-sm text-[#0F172A] outline-none focus:border-[#A5B4FC]"
                      />

                      <div className="mt-3 overflow-auto rounded-[10px] border border-[#E2E8F0]">
                        {sqlResult ? (
                          <SqlTable columns={sqlResult.columns} rows={sqlResult.rows} rowCount={sqlResult.rowCount} />
                        ) : (
                          <PanelPlaceholder label="执行 SQL 后会在这里显示结果。" compact />
                        )}
                      </div>
                    </div>
                  </details>
                </section>
              </div>
            ) : null}

            {activeTab === 'source' && sourceTabEnabled ? (
              <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                  <div className="flex items-center justify-between border-b border-[#E7EBF2] px-3 py-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                      <FolderTree className="h-4 w-4 text-[#64748B]" />
                      文件目录
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!appName) return;
                        setSourceFeedback(null);
                        void loadSourceFiles(appName, setSourceFiles, setSelectedSourcePath, setSourceLoading, setSourceError);
                      }}
                      disabled={sourceLoading || sourceSaving}
                      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[#E2E8F0] px-2 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      <RefreshCw className={clsx('h-3.5 w-3.5', sourceLoading && 'animate-spin')} />
                      刷新
                    </button>
                  </div>

                  <div className="max-h-[calc(100vh-240px)] overflow-auto px-2 py-2">
                    {sourceLoading && sourceFiles.length === 0 ? (
                      <PanelPlaceholder label="加载源码中..." compact />
                    ) : sourceError ? (
                      <div className="rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs leading-5 text-[#B91C1C]">
                        {sourceError}
                      </div>
                    ) : sourceTree.length === 0 ? (
                      <PanelPlaceholder label="暂无源码文件。" compact />
                    ) : (
                      <div className="space-y-0.5">
                        {sourceTree.map((node) => (
                          <SourceTreeItem
                            key={node.path}
                            node={node}
                            level={0}
                            selectedPath={selectedSourcePath}
                            onSelect={(nextPath) => {
                              if (nextPath === selectedSourcePath) return;
                              if (sourceEditMode && hasSourceChanges && !window.confirm('当前文件有未保存修改，确定切换文件吗？')) {
                                return;
                              }
                              setSelectedSourcePath(nextPath);
                              setSourceEditMode(false);
                              setSourceFeedback(null);
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </aside>

                <section className="overflow-hidden rounded-[10px] border border-[#E7EBF2] bg-white">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E7EBF2] px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
                        <FileCode2 className="h-4 w-4 text-[#64748B]" />
                        <span className="truncate">{selectedSourceFile?.path ?? 'Draft APP 源码'}</span>
                        {selectedSourceFile ? (
                          <span className="rounded bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#4F46E5]">
                            {inferSourceLanguage(selectedSourceFile.path)}
                          </span>
                        ) : null}
                        {selectedSourceFile?.immutable ? (
                          <span className="rounded bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[#C2410C]">
                            只读
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-[#94A3B8]">
                        {sourceEditMode
                          ? '编辑完成后保存，必要时会自动 rebuild 并重新加载 Draft APP。'
                          : '左侧选择文件查看源码，支持在 Draft 模式下直接编辑。'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {sourceEditMode ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setSourceDraftContent(selectedSourceFile?.content ?? '');
                              setSourceEditMode(false);
                              setSourceFeedback(null);
                            }}
                            disabled={sourceSaving}
                            className="inline-flex h-8 items-center gap-2 rounded-md border border-[#E2E8F0] px-3 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            取消
                          </button>
                          <button
                            type="button"
                            disabled={sourceSaving || !selectedSourceFile || !hasSourceChanges}
                            onClick={async () => {
                              if (!appName || !selectedSourceFile) return;
                              setSourceSaving(true);
                              setSourceFeedback(null);
                              try {
                                const saveResponse = await fetch(
                                  `/api/v1/apps/${encodeURIComponent(appName)}/files/${encodeRouteFilePath(selectedSourceFile.path)}`,
                                  {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ content: sourceDraftContent }),
                                  },
                                );
                                const savePayload = await saveResponse.json();
                                if (!saveResponse.ok) {
                                  throw new Error(savePayload.error?.message ?? `HTTP ${saveResponse.status}`);
                                }

                                if (savePayload.data?.needs_rebuild) {
                                  const rebuildResponse = await fetch(`/${mode}/apps/${encodeURIComponent(appName)}/rebuild`, {
                                    method: 'POST',
                                  });
                                  const rebuildPayload = await rebuildResponse.json();
                                  if (!rebuildResponse.ok) {
                                    throw new Error(rebuildPayload.error?.message ?? `HTTP ${rebuildResponse.status}`);
                                  }
                                  if (!rebuildPayload.data?.success) {
                                    throw new Error(rebuildPayload.data?.error ?? 'Draft rebuild failed');
                                  }
                                }

                                await Promise.all([
                                  loadSourceFiles(appName, setSourceFiles, setSelectedSourcePath, setSourceLoading, setSourceError),
                                  refreshApp(),
                                ]);
                                setSourceEditMode(false);
                                setSourceFeedback({
                                  tone: 'success',
                                  message: savePayload.data?.needs_rebuild
                                    ? '源码已保存，Draft APP 已重新加载。'
                                    : '源码已保存，修改已应用到 Draft APP。',
                                });
                              } catch (error) {
                                setSourceFeedback({
                                  tone: 'error',
                                  message: error instanceof Error ? error.message : String(error),
                                });
                              } finally {
                                setSourceSaving(false);
                              }
                            }}
                            className="inline-flex h-8 items-center gap-2 rounded-md bg-[#4F46E5] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:opacity-60"
                          >
                            {sourceSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            保存
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={!selectedSourceFile || !!selectedSourceFile.immutable}
                          onClick={() => {
                            if (!selectedSourceFile) return;
                            setSourceDraftContent(selectedSourceFile.content);
                            setSourceEditMode(true);
                            setSourceFeedback(null);
                          }}
                          className="inline-flex h-8 items-center gap-2 rounded-md border border-[#E2E8F0] px-3 text-xs font-semibold text-[#475569] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          编辑源码
                        </button>
                      )}
                    </div>
                  </div>

                  {sourceFeedback ? (
                    <div
                      className={clsx(
                        'mx-4 mt-4 rounded-[10px] border px-4 py-3 text-sm',
                        sourceFeedback.tone === 'success'
                          ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
                          : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]',
                      )}
                    >
                      {sourceFeedback.message}
                    </div>
                  ) : null}

                  {sourceError && !sourceFeedback ? (
                    <div className="mx-4 mt-4 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C]">
                      {sourceError}
                    </div>
                  ) : null}

                  <div className="p-4">
                    {!selectedSourceFile ? (
                      <PanelPlaceholder label="左侧选择一个源码文件。" />
                    ) : sourceEditMode ? (
                      <textarea
                        value={sourceDraftContent}
                        onChange={(event) => setSourceDraftContent(event.target.value)}
                        spellCheck={false}
                        className="h-[calc(100vh-300px)] min-h-[420px] w-full rounded-[10px] border border-[#D7DEEA] bg-[#F8FAFC] p-4 font-mono text-[13px] leading-6 text-[#0F172A] outline-none focus:border-[#A5B4FC]"
                      />
                    ) : (
                      <SourceCodeViewer file={selectedSourceFile} />
                    )}
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

function ConsoleUnderlineTab({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-full items-center border-b-2 px-1 text-sm font-semibold transition-colors',
        active
          ? 'border-[#4F46E5] text-[#4F46E5]'
          : 'border-transparent text-[#94A3B8] hover:text-[#475569]',
      )}
    >
      {label}
    </button>
  );
}

function ConsoleSummaryCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: string;
  tone: 'danger' | 'neutral';
}) {
  const tones = {
    danger: 'border-[#E7EBF2] bg-white',
    neutral: 'border-[#E2E8F0] bg-white',
  };

  return (
    <div className={clsx('rounded-[10px] border p-4', tones[tone])}>
      <div className="text-[11px] font-medium text-[#94A3B8]">{title}</div>
      <div className={clsx('mt-1 font-["Outfit",sans-serif] text-[28px] font-black', tone === 'danger' ? 'text-[#EF4444]' : 'text-[#18181B]')}>
        {value}
      </div>
    </div>
  );
}

function ConsoleFilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex h-6 items-center rounded-md px-2 text-[11px] font-medium transition-colors',
        active
          ? 'bg-white text-[#4F46E5]'
          : 'text-[#94A3B8] hover:bg-white hover:text-[#475569]',
      )}
    >
      {label}
    </button>
  );
}

function StatusPill({
  value,
  tone,
}: {
  value: string;
  tone: 'danger' | 'success' | 'neutral';
}) {
  const tones = {
    danger: 'bg-[#FEE2E2] text-[#DC2626]',
    success: 'bg-[#DCFCE7] text-[#16A34A]',
    neutral: 'bg-[#F1F5F9] text-[#64748B]',
  };

  return (
    <span className={clsx('inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold', tones[tone])}>
      {value}
    </span>
  );
}

function DataTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (rows.length === 0) {
    return <PanelPlaceholder label="暂无可展示的表数据。" compact />;
  }

  const columns = Object.keys(rows[0] ?? {});

  return (
    <table className="min-w-full border-collapse text-sm">
      <thead className="bg-[#F8FAFC] text-left text-[11px] font-semibold tracking-[0.02em] text-[#94A3B8]">
        <tr>
          {columns.map((column) => (
            <th key={column} className="h-10 border-b border-[#E7EBF2] px-4">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index} className="border-b border-[#F1F5F9] last:border-b-0">
            {columns.map((column) => (
              <td key={column} className="h-10 px-4 align-middle text-[12px] text-[#0F172A]">
                {formatCell(row[column])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SqlTable({
  columns,
  rows,
  rowCount,
}: {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}) {
  if (columns.length === 0) {
    return <PanelPlaceholder label={`执行完成，共 ${rowCount} 行。`} compact />;
  }

  return (
    <div>
      <div className="border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-xs font-semibold text-[#64748B]">
        row count {rowCount}
      </div>
      <table className="min-w-full border-collapse text-sm">
        <thead className="bg-[#FCFCFD] text-left text-[11px] font-semibold text-[#94A3B8]">
          <tr>
            {columns.map((column) => (
              <th key={column} className="h-10 border-b border-[#E2E8F0] px-4">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[#EEF2F7] last:border-b-0">
              {columns.map((column, columnIndex) => (
                <td key={`${rowIndex}:${column}:${columnIndex}`} className="h-10 px-4 text-[12px] text-[#0F172A]">
                  {formatCell(row[columnIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelPlaceholder({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div className={clsx('flex items-center justify-center rounded-[10px] border border-dashed border-[#D7DEEA] bg-[#F8FAFC] text-sm text-[#64748B]', compact ? 'min-h-[120px]' : 'min-h-[220px]')}>
      {label}
    </div>
  );
}

function ConsoleLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-[#F3F5F9]">
      <div className="flex items-center gap-3 rounded-2xl border border-[#E2E8F0] bg-white px-5 py-4 text-sm font-semibold text-[#334155] shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading console...
      </div>
    </div>
  );
}

function ConsoleEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-[#F3F5F9] px-6">
      <div className="max-w-xl rounded-[28px] border border-[#E2E8F0] bg-white p-8 text-center shadow-[0_24px_60px_rgba(15,23,42,0.07)]">
        <div className='font-["Outfit",sans-serif] text-2xl font-black text-[#0F172A]'>Console unavailable</div>
        <p className="mt-3 text-sm leading-7 text-[#64748B]">{message}</p>
      </div>
    </div>
  );
}

async function loadOverview(
  appName: string,
  mode: AppMode,
  setOverview: (value: AppConsoleOverview | null) => void,
  setLoading: (value: boolean) => void,
) {
  setLoading(true);
  try {
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}/console?mode=${mode}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    setOverview(payload.data ?? null);
  } catch {
    setOverview(null);
  } finally {
    setLoading(false);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: { message?: string } };
    return payload.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

async function loadErrors(
  appName: string,
  mode: AppMode,
  limit: number,
  offset: number,
  sourceType: ErrorSourceType | null,
  setErrors: (value: AppConsoleErrorItem[]) => void,
  setLoading: (value: boolean) => void,
) {
  setLoading(true);
  try {
    const search = new URLSearchParams({
      mode,
      limit: String(limit),
      offset: String(offset),
    });
    if (sourceType) {
      search.set('source_type', sourceType);
    }
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}/errors?${search.toString()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    setErrors(payload.data?.errors ?? []);
  } catch {
    setErrors([]);
  } finally {
    setLoading(false);
  }
}

async function loadSchedules(
  appName: string,
  mode: AppMode,
  setSchedules: (value: AppConsoleScheduleItem[]) => void,
  setLoading: (value: boolean) => void,
  setSelectedSchedule: (value: string | null | ((prev: string | null) => string | null)) => void,
) {
  setLoading(true);
  try {
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}/schedules?mode=${mode}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    const nextSchedules = payload.data?.schedules ?? [];
    setSchedules(nextSchedules);
    setSelectedSchedule((current) => {
      if (current && nextSchedules.some((schedule: AppConsoleScheduleItem) => schedule.name === current)) {
        return current;
      }
      return nextSchedules[0]?.name ?? null;
    });
  } catch {
    setSchedules([]);
    setSelectedSchedule(null);
  } finally {
    setLoading(false);
  }
}

async function loadScheduleRuns(
  appName: string,
  mode: AppMode,
  scheduleName: string,
  setRuns: (value: AppConsoleScheduleRun[]) => void,
  setLoading: (value: boolean) => void,
) {
  setLoading(true);
  try {
    const response = await fetch(
      `/api/v1/apps/${encodeURIComponent(appName)}/schedules/${encodeURIComponent(scheduleName)}/runs?mode=${mode}&limit=20`,
    );
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    setRuns(payload.data?.runs ?? []);
  } catch {
    setRuns([]);
  } finally {
    setLoading(false);
  }
}

async function loadDatabaseSchema(
  appName: string,
  mode: AppMode,
  setSchema: (value: DbSchemaMap) => void,
  setSelectedTable: (value: string | null | ((prev: string | null) => string | null)) => void,
  setLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  setLoading(true);
  setError(null);
  try {
    const response = await fetch(`/${mode}/apps/${encodeURIComponent(appName)}/fn/_db/schemas`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    const nextSchema = (payload.data ?? {}) as DbSchemaMap;
    const nextTableNames = getVisibleDatabaseTables(nextSchema);
    setSchema(nextSchema);
    setSelectedTable((current) => (current && isVisibleDatabaseTable(current) && nextSchema[current] ? current : nextTableNames[0] ?? null));
  } catch (error) {
    setSchema({});
    setSelectedTable(null);
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setLoading(false);
  }
}

async function loadTableRows(
  appName: string,
  mode: AppMode,
  tableName: string,
  setRows: (value: Record<string, unknown>[]) => void,
  setMeta: (value: { total: number; limit: number; offset: number } | null) => void,
  setLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  setLoading(true);
  setError(null);
  try {
    const response = await fetch(`/${mode}/apps/${encodeURIComponent(appName)}/fn/_db/tables/${encodeURIComponent(tableName)}?limit=20&offset=0`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }
    setRows(payload.data ?? []);
    setMeta(payload.meta ?? null);
  } catch (error) {
    setRows([]);
    setMeta(null);
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setLoading(false);
  }
}

async function loadSourceFiles(
  appName: string,
  setFiles: (value: AppSourceFile[]) => void,
  setSelectedPath: (value: string | null | ((prev: string | null) => string | null)) => void,
  setLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  setLoading(true);
  setError(null);
  try {
    const response = await fetch(`/api/v1/apps/${encodeURIComponent(appName)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `HTTP ${response.status}`);
    }

    const nextFiles = Array.isArray(payload.data?.files)
      ? (payload.data.files as AppSourceFile[]).slice().sort((a, b) => a.path.localeCompare(b.path))
      : [];

    setFiles(nextFiles);
    setSelectedPath((current) => (
      current && nextFiles.some((file) => file.path === current)
        ? current
        : nextFiles[0]?.path ?? null
    ));
  } catch (error) {
    setFiles([]);
    setSelectedPath(null);
    setError(error instanceof Error ? error.message : String(error));
  } finally {
    setLoading(false);
  }
}

function parseConsoleTab(value: string | null): ConsoleTab {
  return value === 'schedules' || value === 'database' || value === 'source' ? value : 'errors';
}

function parseErrorSource(value: string | null): ErrorSourceType | null {
  return value === 'http_function' || value === 'schedule' || value === 'build' ? value : null;
}

function parsePositiveInteger(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isVisibleDatabaseTable(tableName: string) {
  return tableName !== '_migrations';
}

function getVisibleDatabaseTables(schema: DbSchemaMap) {
  return Object.keys(schema).filter(isVisibleDatabaseTable);
}

function sourceLabel(source: ErrorSourceType) {
  switch (source) {
    case 'http_function':
      return 'HTTP 函数';
    case 'schedule':
      return '定时任务';
    case 'build':
      return '构建流程';
  }
}

function sourceDotClass(source: ErrorSourceType) {
  switch (source) {
    case 'http_function':
      return 'bg-[#F97316]';
    case 'schedule':
      return 'bg-[#10B981]';
    case 'build':
      return 'bg-[#6366F1]';
  }
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function formatCell(value: unknown) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

type SourceTreeNode = {
  kind: 'directory' | 'file';
  name: string;
  path: string;
  immutable?: boolean;
  children?: SourceTreeNode[];
};

function SourceTreeItem({
  node,
  level,
  selectedPath,
  onSelect,
}: {
  node: SourceTreeNode;
  level: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}) {
  if (node.kind === 'directory') {
    return (
      <div>
        <div
          className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-[#94A3B8]"
          style={{ paddingLeft: `${level * 14 + 8}px` }}
        >
          <FolderTree className="h-3.5 w-3.5" />
          {node.name}
        </div>
        <div>
          {node.children?.map((child) => (
            <SourceTreeItem
              key={child.path}
              node={child}
              level={level + 1}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.path)}
      className={clsx(
        'flex w-full items-center justify-between rounded-md py-2 pr-2 text-left text-sm transition-colors',
        selectedPath === node.path
          ? 'bg-[#EEF2FF] font-semibold text-[#4F46E5]'
          : 'text-[#475569] hover:bg-[#F8FAFC]',
      )}
      style={{ paddingLeft: `${level * 14 + 12}px` }}
    >
      <span className="truncate">{node.name}</span>
      {node.immutable ? <span className="text-[10px] font-semibold text-[#C2410C]">只读</span> : null}
    </button>
  );
}

function SourceCodeViewer({ file }: { file: AppSourceFile }) {
  const lines = file.content.split('\n');
  const language = inferSourceLanguage(file.path);

  return (
    <div className="h-[calc(100vh-300px)] min-h-[420px] overflow-auto rounded-[10px] border border-[#0F172A] bg-[#0B1220] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <table className="min-w-full border-collapse font-mono text-[12px] leading-6">
        <tbody>
          {lines.map((line, index) => (
            <tr key={`${file.path}:${index}`}>
              <td className="select-none border-r border-[#1E293B] bg-[#020617] px-3 text-right align-top text-[#475569]">
                {index + 1}
              </td>
              <td className="w-full px-4 align-top text-[#E2E8F0]">
                <code
                  className="block min-h-6 whitespace-pre"
                  dangerouslySetInnerHTML={{ __html: highlightCodeLine(line, language) || '&nbsp;' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function buildSourceTree(files: AppSourceFile[]): SourceTreeNode[] {
  const root: SourceTreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let currentLevel = root;
    let currentPath = '';

    for (const [index, part] of parts.entries()) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isFile = index === parts.length - 1;
      const existing = currentLevel.find((node) => node.name === part);

      if (existing) {
        if (!isFile && existing.children) {
          currentLevel = existing.children;
        }
        continue;
      }

      const node: SourceTreeNode = isFile
        ? { kind: 'file', name: part, path: currentPath, immutable: file.immutable }
        : { kind: 'directory', name: part, path: currentPath, children: [] };
      currentLevel.push(node);

      if (!isFile && node.children) {
        currentLevel = node.children;
      }
    }
  }

  return sortSourceTreeNodes(root);
}

function sortSourceTreeNodes(nodes: SourceTreeNode[]): SourceTreeNode[] {
  return nodes
    .map((node) => (
      node.kind === 'directory' && node.children
        ? { ...node, children: sortSourceTreeNodes(node.children) }
        : node
    ))
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'directory' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function inferSourceLanguage(path: string) {
  if (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.jsx')) {
    return 'ts';
  }
  if (path.endsWith('.json')) {
    return 'json';
  }
  if (path.endsWith('.sql')) {
    return 'sql';
  }
  if (path.endsWith('.yaml') || path.endsWith('.yml')) {
    return 'yaml';
  }
  if (path.endsWith('.md')) {
    return 'md';
  }
  return 'text';
}

function highlightCodeLine(line: string, language: string) {
  const tokenPattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|--.*$|#.*$|\b(?:true|false|null|undefined|async|await|export|import|from|return|const|let|var|function|if|else|switch|case|break|for|while|try|catch|throw|new|class|extends|implements|type|interface)\b|\b\d+(?:\.\d+)?\b)/gm;
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(line)) !== null) {
    result += escapeHtml(line.slice(lastIndex, match.index));
    result += `<span class="${highlightClass(match[0], language)}">${escapeHtml(match[0])}</span>`;
    lastIndex = match.index + match[0].length;
  }

  result += escapeHtml(line.slice(lastIndex));
  return result;
}

function highlightClass(token: string, language: string) {
  if (token.startsWith('//') || token.startsWith('--') || (language !== 'json' && token.startsWith('#'))) {
    return 'text-[#64748B]';
  }
  if (token.startsWith('"') || token.startsWith('\'') || token.startsWith('`')) {
    return 'text-[#86EFAC]';
  }
  if (/^\d/.test(token)) {
    return 'text-[#F9A8D4]';
  }
  return 'text-[#7DD3FC]';
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function encodeRouteFilePath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/');
}
