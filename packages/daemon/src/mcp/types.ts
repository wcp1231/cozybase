/**
 * MCP Backend types for CozyBase.
 *
 * CozybaseBackend abstracts cozybase operations for MCP tool handlers,
 * connecting to a running daemon via HTTP.
 */

import type { StableStatus } from '../core/workspace';
import type {
  AppConsoleErrorsResult,
  AppConsoleOverview,
  AppConsoleScheduleRunsResult,
  AppConsoleSchedulesResult,
} from '../core/app-console-service';
import type { DraftReconcileResult } from '../core/draft-reconciler';
import type { VerifyResult } from '../core/verifier';
import type { PublishResult } from '../core/publisher';

// Re-export core result types for convenience
export type { DraftReconcileResult, VerifyResult, PublishResult };

// --- Shared Types ---

/** A single file entry (path + content) for sync operations */
export interface FileEntry {
  path: string;
  content: string;
}

/** Full app snapshot including file contents (returned by createApp/fetchApp) */
export interface AppSnapshot {
  slug: string;
  displayName: string;
  description: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
  files: FileEntry[];
}

/** App summary info without file contents (returned by listApps) */
export interface AppInfo {
  slug: string;
  displayName: string;
  description: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
}

/** Result of a full-sync push operation */
export interface PushResult {
  files: string[];
  changes: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

/** Result of a SQL query execution */
export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

/** Result of an API call */
export interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export type { AppConsoleOverview, AppConsoleErrorsResult, AppConsoleSchedulesResult, AppConsoleScheduleRunsResult };

// --- Backend Interface ---

/**
 * Abstraction layer for cozybase operations.
 *
 * Implemented by LocalBackend, which calls core services directly.
 * MCP tool handlers use this interface exclusively.
 */
export interface CozybaseBackend {
  // App lifecycle
  createApp(slug: string, description?: string, displayName?: string): Promise<AppSnapshot>;
  listApps(): Promise<AppInfo[]>;
  fetchApp(slug: string): Promise<AppSnapshot>;
  deleteApp(slug: string): Promise<void>;
  startApp(slug: string): Promise<AppInfo>;
  stopApp(slug: string): Promise<AppInfo>;

  // File sync
  pushFiles(slug: string, files: FileEntry[]): Promise<PushResult>;
  pushFile(slug: string, path: string, content: string): Promise<'created' | 'updated'>;

  // Dev workflow
  reconcile(slug: string): Promise<DraftReconcileResult>;
  verify(slug: string): Promise<VerifyResult>;
  publish(slug: string): Promise<PublishResult>;

  // Runtime interaction
  executeSql(slug: string, sql: string, mode: string): Promise<SqlResult>;
  callApi(slug: string, method: string, path: string, body?: unknown, mode?: string): Promise<ApiResponse>;
  getAppConsole(slug: string, mode?: string): Promise<AppConsoleOverview>;
  getAppErrors(
    slug: string,
    mode?: string,
    limit?: number,
    offset?: number,
    sourceType?: string,
  ): Promise<AppConsoleErrorsResult>;
  getAppSchedules(slug: string, mode?: string): Promise<AppConsoleSchedulesResult>;
  getAppScheduleRuns(
    slug: string,
    scheduleName: string,
    mode?: string,
    limit?: number,
  ): Promise<AppConsoleScheduleRunsResult>;

  // UI inspection (requires browser session)
  inspectUi(appSlug: string, page?: string): Promise<unknown>;
}
