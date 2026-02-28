/**
 * MCP Backend types for CozyBase.
 *
 * CozybaseBackend abstracts the connection mode (embedded vs remote),
 * so MCP tool handlers work identically in both deployment scenarios.
 */

import type { StableStatus } from '../core/workspace';
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
  name: string;
  description: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
  files: FileEntry[];
}

/** App summary info without file contents (returned by listApps) */
export interface AppInfo {
  name: string;
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

// --- Backend Interface ---

/**
 * Abstraction layer for cozybase operations.
 *
 * - EmbeddedBackend: directly calls internal modules (local mode)
 * - RemoteBackend: calls cozybase daemon via HTTP API (remote mode)
 *
 * MCP tool handlers use this interface exclusively, never checking which
 * mode is active.
 */
export interface CozybaseBackend {
  // App lifecycle
  createApp(name: string, description?: string): Promise<AppSnapshot>;
  listApps(): Promise<AppInfo[]>;
  fetchApp(name: string): Promise<AppSnapshot>;
  deleteApp(name: string): Promise<void>;
  startApp(name: string): Promise<AppInfo>;
  stopApp(name: string): Promise<AppInfo>;

  // File sync
  pushFiles(name: string, files: FileEntry[]): Promise<PushResult>;
  pushFile(name: string, path: string, content: string): Promise<'created' | 'updated'>;

  // Dev workflow
  reconcile(name: string): Promise<DraftReconcileResult>;
  verify(name: string): Promise<VerifyResult>;
  publish(name: string): Promise<PublishResult>;

  // Runtime interaction
  executeSql(name: string, sql: string, mode: string): Promise<SqlResult>;
  callApi(name: string, method: string, path: string, body?: unknown, mode?: string): Promise<ApiResponse>;
}
