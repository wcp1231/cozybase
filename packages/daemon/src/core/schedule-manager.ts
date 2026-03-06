import { Cron } from 'croner';
import {
  executeFunctionReference,
  type AppRegistry,
  type PlatformClient,
} from '@cozybase/runtime';
import { AppErrorRecorder } from './app-error-recorder';
import { NotFoundError } from './errors';
import type { PlatformRepository, ScheduleRunRuntimeMode, ScheduleRunStatus, ScheduleRunTriggerMode } from './platform-repository';
import { loadSchedulesFromAppConfig, type AppSchedule } from './schedule-config';

interface ScheduleManagerDeps {
  platformRepo: PlatformRepository;
  registry: AppRegistry;
  stablePlatformClient: PlatformClient;
  draftPlatformClient: PlatformClient;
  errorRecorder?: AppErrorRecorder;
}

interface LoadedAppSchedules {
  schedules: Map<string, AppSchedule>;
  jobs: Map<string, Cron>;
}

interface ScheduleExecutionRequest {
  appSlug: string;
  schedule: AppSchedule;
  runtimeMode: ScheduleRunRuntimeMode;
  triggerMode: ScheduleRunTriggerMode;
}

interface QueuedExecution {
  request: ScheduleExecutionRequest;
  resolve: (value: ScheduleExecutionResult) => void;
  reject: (reason?: unknown) => void;
}

interface ScheduleExecutionState {
  running: number;
  queued: QueuedExecution | null;
}

export interface ScheduleExecutionResult {
  runId: number;
  appSlug: string;
  scheduleName: string;
  runtimeMode: ScheduleRunRuntimeMode;
  triggerMode: ScheduleRunTriggerMode;
  status: ScheduleRunStatus;
  skipped: boolean;
  durationMs: number;
  errorMessage?: string;
  result?: unknown;
}

export interface AppScheduleStatus {
  name: string;
  cron: string;
  enabled: boolean;
  function: string;
  concurrency: AppSchedule['concurrency'];
  timeout: number;
  timezone: string;
  nextRun: string | null;
  lastRun: ReturnType<PlatformRepository['scheduleRuns']['findById']>;
}

class ScheduleTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Schedule execution timed out after ${timeoutMs}ms`);
    this.name = 'ScheduleTimeoutError';
  }
}

export class ScheduleManager {
  private loadedApps = new Map<string, LoadedAppSchedules>();
  private executionStates = new Map<string, ScheduleExecutionState>();

  constructor(private deps: ScheduleManagerDeps) {}

  async loadApp(appSlug: string): Promise<void> {
    this.unloadApp(appSlug);

    const { schedules, warnings } = loadSchedulesFromAppConfig(this.deps.platformRepo, appSlug);
    for (const warning of warnings) {
      console.warn(`[schedule:${appSlug}] ${warning}`);
    }

    const enabledSchedules = schedules.filter((schedule) => schedule.enabled);
    if (enabledSchedules.length === 0) {
      return;
    }

    const jobs = new Map<string, Cron>();
    const scheduleMap = new Map<string, AppSchedule>();

    for (const schedule of enabledSchedules) {
      const job = new Cron(
        schedule.cron,
        {
          timezone: schedule.timezone,
          catch: (err) => {
            console.error(`[schedule:${appSlug}/${schedule.name}] Unhandled cron callback error`, err);
          },
        },
        () => {
          void this.executeSchedule({
            appSlug,
            schedule,
            runtimeMode: 'stable',
            triggerMode: 'auto',
          }).catch((err) => {
            console.error(`[schedule:${appSlug}/${schedule.name}] Failed to execute`, err);
          });
        },
      );

      jobs.set(schedule.name, job);
      scheduleMap.set(schedule.name, schedule);
    }

    this.loadedApps.set(appSlug, {
      schedules: scheduleMap,
      jobs,
    });
  }

  unloadApp(appSlug: string): void {
    const loaded = this.loadedApps.get(appSlug);
    if (loaded) {
      for (const job of loaded.jobs.values()) {
        job.stop();
      }
      this.loadedApps.delete(appSlug);
    }

    const stateKeyPrefix = `${appSlug}:`;
    for (const key of this.executionStates.keys()) {
      if (key.startsWith(stateKeyPrefix)) {
        this.executionStates.delete(key);
      }
    }
  }

  async reloadApp(appSlug: string): Promise<void> {
    this.unloadApp(appSlug);
    await this.loadApp(appSlug);
  }

  shutdown(): void {
    for (const appSlug of this.loadedApps.keys()) {
      this.unloadApp(appSlug);
    }
  }

  async triggerManual(
    appSlug: string,
    scheduleName: string,
    runtimeMode: ScheduleRunRuntimeMode,
  ): Promise<ScheduleExecutionResult> {
    const { schedules, warnings } = loadSchedulesFromAppConfig(this.deps.platformRepo, appSlug);
    for (const warning of warnings) {
      console.warn(`[schedule:${appSlug}] ${warning}`);
    }

    const schedule = schedules.find((item) => item.name === scheduleName);
    if (!schedule) {
      throw new NotFoundError(`Schedule '${scheduleName}' not found in app '${appSlug}'`);
    }

    return await this.executeSchedule({
      appSlug,
      schedule,
      runtimeMode,
      triggerMode: 'manual',
    });
  }

  getLoadedScheduleNames(appSlug: string): string[] {
    const loaded = this.loadedApps.get(appSlug);
    if (!loaded) return [];
    return Array.from(loaded.schedules.keys()).sort();
  }

  getAppScheduleStatus(
    appSlug: string,
    runtimeMode: ScheduleRunRuntimeMode,
  ): AppScheduleStatus[] {
    const { schedules, warnings } = loadSchedulesFromAppConfig(this.deps.platformRepo, appSlug);
    for (const warning of warnings) {
      console.warn(`[schedule:${appSlug}] ${warning}`);
    }

    const loaded = runtimeMode === 'stable' ? this.loadedApps.get(appSlug) : undefined;

    return schedules
      .map((schedule) => {
        const job = loaded?.jobs.get(schedule.name);
        const nextRun = job?.nextRun();
        const lastRun = this.deps.platformRepo.scheduleRuns.findByAppAndSchedule(
          appSlug,
          schedule.name,
          1,
          runtimeMode,
        )[0] ?? null;

        return {
          name: schedule.name,
          cron: schedule.cron,
          enabled: schedule.enabled,
          function: schedule.functionRef.raw,
          concurrency: schedule.concurrency,
          timeout: schedule.timeout,
          timezone: schedule.timezone,
          nextRun: nextRun ? nextRun.toISOString() : null,
          lastRun,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private async executeSchedule(request: ScheduleExecutionRequest): Promise<ScheduleExecutionResult> {
    const key = this.executionStateKey(
      request.appSlug,
      request.schedule.name,
      request.runtimeMode,
    );
    const state = this.getOrCreateExecutionState(key);
    const policy = request.schedule.concurrency;

    if (policy === 'parallel' || state.running === 0) {
      return await this.runExecutionNow(request, state);
    }

    if (policy === 'skip') {
      return await this.createSkippedRun(
        request,
        `Skipped due to concurrency policy 'skip'`,
      );
    }

    if (!state.queued) {
      return await new Promise<ScheduleExecutionResult>((resolve, reject) => {
        state.queued = { request, resolve, reject };
      });
    }

    return await this.createSkippedRun(
      request,
      `Skipped due to concurrency policy 'queue' (queue is full)`,
    );
  }

  private async runExecutionNow(
    request: ScheduleExecutionRequest,
    state: ScheduleExecutionState,
  ): Promise<ScheduleExecutionResult> {
    state.running += 1;
    const startedAt = Date.now();

    const runId = this.deps.platformRepo.scheduleRuns.create({
      appSlug: request.appSlug,
      scheduleName: request.schedule.name,
      runtimeMode: request.runtimeMode,
      triggerMode: request.triggerMode,
      status: 'running',
      functionRef: request.schedule.functionRef.raw,
    });

    try {
      const entry = this.deps.registry.get(request.appSlug, request.runtimeMode);
      if (!entry || entry.status !== 'running') {
        throw new Error(
          `Runtime '${request.appSlug}:${request.runtimeMode}' is not running`,
        );
      }

      const platformClient = this.getPlatformClient(request.runtimeMode);
      const rawResult = await this.executeWithTimeout(
        () => executeFunctionReference(
          entry,
          {
            functionName: request.schedule.functionRef.fileName,
            exportName: request.schedule.functionRef.exportName,
          },
          platformClient,
          { trigger: 'cron' },
        ),
        request.schedule.timeout,
      );
      const serializedResult = await this.serializeResult(rawResult);
      const durationMs = Date.now() - startedAt;

      this.deps.platformRepo.scheduleRuns.updateStatus(runId, {
        status: 'success',
        durationMs,
      });
      this.deps.platformRepo.scheduleRuns.pruneToRecent(
        request.appSlug,
        request.schedule.name,
        100,
      );

      return {
        runId,
        appSlug: request.appSlug,
        scheduleName: request.schedule.name,
        runtimeMode: request.runtimeMode,
        triggerMode: request.triggerMode,
        status: 'success',
        skipped: false,
        durationMs,
        result: serializedResult,
      };
    } catch (err) {
      const durationMs = Date.now() - startedAt;
      const timeout = err instanceof ScheduleTimeoutError;
      const status: ScheduleRunStatus = timeout ? 'timeout' : 'error';
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.deps.platformRepo.scheduleRuns.updateStatus(runId, {
        status,
        durationMs,
        errorMessage,
      });
      this.deps.platformRepo.scheduleRuns.pruneToRecent(
        request.appSlug,
        request.schedule.name,
        100,
      );
      this.deps.errorRecorder?.record({
        appSlug: request.appSlug,
        runtimeMode: request.runtimeMode,
        sourceType: 'schedule',
        sourceDetail: `schedule:${request.schedule.name}`,
        errorCode: timeout ? 'SCHEDULE_TIMEOUT' : 'SCHEDULE_ERROR',
        errorMessage,
        stackTrace: err instanceof Error ? err.stack : undefined,
      });

      return {
        runId,
        appSlug: request.appSlug,
        scheduleName: request.schedule.name,
        runtimeMode: request.runtimeMode,
        triggerMode: request.triggerMode,
        status,
        skipped: false,
        durationMs,
        errorMessage,
      };
    } finally {
      state.running -= 1;
      if (state.running === 0 && state.queued) {
        const queued = state.queued;
        state.queued = null;
        void this.executeSchedule(queued.request).then(queued.resolve, queued.reject);
      }
    }
  }

  private async createSkippedRun(
    request: ScheduleExecutionRequest,
    errorMessage: string,
  ): Promise<ScheduleExecutionResult> {
    const runId = this.deps.platformRepo.scheduleRuns.create({
      appSlug: request.appSlug,
      scheduleName: request.schedule.name,
      runtimeMode: request.runtimeMode,
      triggerMode: request.triggerMode,
      status: 'running',
      functionRef: request.schedule.functionRef.raw,
    });

    this.deps.platformRepo.scheduleRuns.updateStatus(runId, {
      status: 'skipped',
      durationMs: 0,
      errorMessage,
    });
    this.deps.platformRepo.scheduleRuns.pruneToRecent(
      request.appSlug,
      request.schedule.name,
      100,
    );

    return {
      runId,
      appSlug: request.appSlug,
      scheduleName: request.schedule.name,
      runtimeMode: request.runtimeMode,
      triggerMode: request.triggerMode,
      status: 'skipped',
      skipped: true,
      durationMs: 0,
      errorMessage,
    };
  }

  private getPlatformClient(mode: ScheduleRunRuntimeMode): PlatformClient {
    return mode === 'stable'
      ? this.deps.stablePlatformClient
      : this.deps.draftPlatformClient;
  }

  private getOrCreateExecutionState(key: string): ScheduleExecutionState {
    const existing = this.executionStates.get(key);
    if (existing) {
      return existing;
    }

    const state: ScheduleExecutionState = {
      running: 0,
      queued: null,
    };
    this.executionStates.set(key, state);
    return state;
  }

  private executionStateKey(
    appSlug: string,
    scheduleName: string,
    runtimeMode: ScheduleRunRuntimeMode,
  ): string {
    return `${appSlug}:${runtimeMode}:${scheduleName}`;
  }

  private async executeWithTimeout<T>(
    run: () => Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    const abortController = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        abortController.abort();
        reject(new ScheduleTimeoutError(timeoutMs));
      }, timeoutMs);
    });

    try {
      return await Promise.race([run(), timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async serializeResult(result: unknown): Promise<unknown> {
    if (!(result instanceof Response)) {
      return result;
    }

    const headers = Object.fromEntries(result.headers.entries());
    let body: unknown = null;

    try {
      const text = await result.text();
      if (text.length > 0) {
        const contentType = result.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          try {
            body = JSON.parse(text);
          } catch {
            body = text;
          }
        } else {
          body = text;
        }
      }
    } catch {
      body = null;
    }

    return {
      status: result.status,
      headers,
      body,
    };
  }
}
