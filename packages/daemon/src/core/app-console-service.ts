import type { Workspace, StableStatus } from './workspace';
import { NotFoundError } from './errors';
import type {
  AppErrorLogRecord,
  AppErrorLogRuntimeMode,
  AppErrorLogSourceType,
  ScheduleRunRecord,
} from './platform-repository';
import type { AppScheduleStatus, ScheduleManager } from './schedule-manager';

export interface AppConsoleAppStatus {
  stable_running: boolean;
  stable_status: StableStatus | null;
  current_version: number;
  published_version: number;
}

export interface AppConsoleErrorSummary {
  total_24h: number;
  by_source: Partial<Record<AppErrorLogSourceType, number>>;
  latest?: {
    source: AppErrorLogSourceType;
    message: string;
    created_at: string;
  };
}

export interface AppConsoleSchedulesSummary {
  total: number;
  healthy: number;
  failing: number;
  failing_names: string[];
}

export interface AppConsoleOverview {
  app_status: AppConsoleAppStatus;
  error_summary: AppConsoleErrorSummary;
  schedules_summary: AppConsoleSchedulesSummary;
}

export interface AppConsoleErrorItem {
  source_type: AppErrorLogSourceType;
  source_detail: string | null;
  error_code: string | null;
  error_message: string;
  stack_trace: string | null;
  occurrence_count: number;
  created_at: string;
  updated_at: string;
}

export interface AppConsoleErrorsResult {
  errors: AppConsoleErrorItem[];
}

export interface AppConsoleScheduleRun {
  id: number;
  runtime_mode: 'stable' | 'draft';
  trigger_mode: 'auto' | 'manual';
  status: 'running' | 'success' | 'error' | 'timeout' | 'skipped';
  function_ref: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

export interface AppConsoleScheduleItem {
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

export interface AppConsoleSchedulesResult {
  schedules: AppConsoleScheduleItem[];
}

export interface AppConsoleScheduleRunsResult {
  runs: AppConsoleScheduleRun[];
}

export interface AppConsoleErrorsOptions {
  limit?: number;
  offset?: number;
  sourceType?: AppErrorLogSourceType;
}

export class AppConsoleService {
  constructor(
    private workspace: Workspace,
    private scheduleManager: ScheduleManager,
  ) {}

  getConsoleOverview(
    appSlug: string,
    mode: AppErrorLogRuntimeMode,
  ): AppConsoleOverview {
    const app = this.getApp(appSlug);
    const schedules = this.scheduleManager.getAppScheduleStatus(appSlug, mode);
    const failingSchedules = schedules
      .filter((schedule) => schedule.lastRun?.status === 'error' || schedule.lastRun?.status === 'timeout')
      .map((schedule) => schedule.name);
    const errorSummary = this.workspace.getPlatformRepo().appErrorLogs.summarizeLast24h(appSlug, mode);

    return {
      app_status: {
        stable_running: app.stable_status === 'running',
        stable_status: app.stable_status,
        current_version: app.current_version,
        published_version: app.published_version,
      },
      error_summary: {
        total_24h: errorSummary.total24h,
        by_source: errorSummary.bySource,
        ...(errorSummary.latest ? {
          latest: {
            source: errorSummary.latest.source_type,
            message: errorSummary.latest.error_message,
            created_at: errorSummary.latest.created_at,
          },
        } : {}),
      },
      schedules_summary: {
        total: schedules.length,
        healthy: schedules.length - failingSchedules.length,
        failing: failingSchedules.length,
        failing_names: failingSchedules,
      },
    };
  }

  getErrors(
    appSlug: string,
    mode: AppErrorLogRuntimeMode,
    options: AppConsoleErrorsOptions = {},
  ): AppConsoleErrorsResult {
    this.getApp(appSlug);
    const errors = this.workspace.getPlatformRepo().appErrorLogs.listByAppAndMode(appSlug, mode, {
      limit: options.limit,
      offset: options.offset,
      sourceType: options.sourceType,
    });

    return {
      errors: errors.map((error) => this.mapError(error)),
    };
  }

  getSchedules(
    appSlug: string,
    mode: AppErrorLogRuntimeMode,
  ): AppConsoleSchedulesResult {
    this.getApp(appSlug);
    return {
      schedules: this.scheduleManager
        .getAppScheduleStatus(appSlug, mode)
        .map((schedule) => this.mapSchedule(schedule)),
    };
  }

  getScheduleRuns(
    appSlug: string,
    scheduleName: string,
    mode: AppErrorLogRuntimeMode,
    limit = 20,
  ): AppConsoleScheduleRunsResult {
    this.getApp(appSlug);
    const schedules = this.scheduleManager.getAppScheduleStatus(appSlug, mode);
    if (!schedules.some((schedule) => schedule.name === scheduleName)) {
      throw new NotFoundError(`Schedule '${scheduleName}' not found in app '${appSlug}'`);
    }

    const runs = this.workspace.getPlatformRepo().scheduleRuns.findByAppAndSchedule(
      appSlug,
      scheduleName,
      limit,
      mode,
    );

    return {
      runs: runs.map((run) => this.mapRun(run)),
    };
  }

  private getApp(appSlug: string) {
    const app = this.workspace.getPlatformRepo().apps.findBySlug(appSlug);
    if (!app) {
      throw new NotFoundError(`App '${appSlug}' not found`);
    }
    return app;
  }

  private mapError(error: AppErrorLogRecord): AppConsoleErrorItem {
    return {
      source_type: error.source_type,
      source_detail: error.source_detail,
      error_code: error.error_code,
      error_message: error.error_message,
      stack_trace: error.stack_trace,
      occurrence_count: error.occurrence_count,
      created_at: error.created_at,
      updated_at: error.updated_at,
    };
  }

  private mapSchedule(schedule: AppScheduleStatus): AppConsoleScheduleItem {
    return {
      name: schedule.name,
      cron: schedule.cron,
      enabled: schedule.enabled,
      function: schedule.function,
      concurrency: schedule.concurrency,
      timeout: schedule.timeout,
      timezone: schedule.timezone,
      next_run: schedule.nextRun,
      last_run: schedule.lastRun ? this.mapRun(schedule.lastRun) : null,
    };
  }

  private mapRun(run: ScheduleRunRecord): AppConsoleScheduleRun {
    return {
      id: run.id,
      runtime_mode: run.runtime_mode,
      trigger_mode: run.trigger_mode,
      status: run.status,
      function_ref: run.function_ref,
      started_at: run.started_at,
      finished_at: run.finished_at,
      duration_ms: run.duration_ms,
      error_message: run.error_message,
    };
  }
}
