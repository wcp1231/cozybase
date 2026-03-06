import type { ErrorRecorder, ErrorRecordEntry } from '@cozybase/runtime';
import type { AppErrorLogRuntimeMode, PlatformRepository } from './platform-repository';

export interface AppErrorRecorderOptions {
  limitPerMinute?: number;
  duplicateWindowSeconds?: number;
  keepPerAppMode?: number;
  now?: () => Date;
}

export interface AppErrorRecordResult {
  status: 'inserted' | 'deduplicated' | 'rate_limited';
  id?: number;
}

interface RateLimitBucket {
  minuteKey: string;
  count: number;
}

export class AppErrorRecorder implements ErrorRecorder {
  private readonly limitPerMinute: number;
  private readonly duplicateWindowSeconds: number;
  private readonly keepPerAppMode: number;
  private readonly now: () => Date;
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(
    private platformRepo: PlatformRepository,
    options: AppErrorRecorderOptions = {},
  ) {
    this.limitPerMinute = options.limitPerMinute ?? 30;
    this.duplicateWindowSeconds = options.duplicateWindowSeconds ?? 60;
    this.keepPerAppMode = options.keepPerAppMode ?? 200;
    this.now = options.now ?? (() => new Date());
  }

  record(entry: ErrorRecordEntry): void {
    this.recordDetailed(entry);
  }

  recordDetailed(entry: ErrorRecordEntry): AppErrorRecordResult {
    return this.platformRepo.transaction(() => {
      const duplicate = this.platformRepo.appErrorLogs.findRecentDuplicate({
        appSlug: entry.appSlug,
        runtimeMode: entry.runtimeMode,
        sourceType: entry.sourceType,
        sourceDetail: entry.sourceDetail ?? null,
        errorMessage: entry.errorMessage,
        withinSeconds: this.duplicateWindowSeconds,
      });

      if (duplicate) {
        this.platformRepo.appErrorLogs.incrementOccurrence(duplicate.id);
        return { status: 'deduplicated', id: duplicate.id };
      }

      if (this.isRateLimited(entry.appSlug, entry.runtimeMode)) {
        return { status: 'rate_limited' };
      }

      const id = this.platformRepo.appErrorLogs.create({
        appSlug: entry.appSlug,
        runtimeMode: entry.runtimeMode,
        sourceType: entry.sourceType,
        sourceDetail: entry.sourceDetail ?? null,
        errorCode: entry.errorCode ?? null,
        errorMessage: entry.errorMessage,
        stackTrace: entry.stackTrace ?? null,
      });
      this.incrementRateLimit(entry.appSlug, entry.runtimeMode);
      this.platformRepo.appErrorLogs.pruneToRecent(
        entry.appSlug,
        entry.runtimeMode,
        this.keepPerAppMode,
      );
      return { status: 'inserted', id };
    });
  }

  clearDraftErrors(appSlug: string): void {
    this.platformRepo.appErrorLogs.deleteByAppAndMode(appSlug, 'draft');
  }

  private isRateLimited(appSlug: string, runtimeMode: AppErrorLogRuntimeMode): boolean {
    const bucket = this.getBucket(appSlug, runtimeMode);
    return bucket.count >= this.limitPerMinute;
  }

  private incrementRateLimit(appSlug: string, runtimeMode: AppErrorLogRuntimeMode): void {
    const bucket = this.getBucket(appSlug, runtimeMode);
    bucket.count += 1;
  }

  private getBucket(appSlug: string, runtimeMode: AppErrorLogRuntimeMode): RateLimitBucket {
    const bucketKey = `${appSlug}:${runtimeMode}`;
    const minuteKey = this.currentMinuteKey();
    const existing = this.buckets.get(bucketKey);

    if (existing && existing.minuteKey === minuteKey) {
      return existing;
    }

    const bucket: RateLimitBucket = { minuteKey, count: 0 };
    this.buckets.set(bucketKey, bucket);
    return bucket;
  }

  private currentMinuteKey(): string {
    return this.now().toISOString().slice(0, 16);
  }
}
