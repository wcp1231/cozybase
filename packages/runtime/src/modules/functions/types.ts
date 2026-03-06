import type { PlatformClient } from '../../platform-client';

// --- DatabaseClient ---

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[];
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number };
  exec(sql: string): void;
}

// --- Logger ---

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

export interface ErrorRecordEntry {
  appSlug: string;
  runtimeMode: 'stable' | 'draft';
  sourceType: 'http_function' | 'schedule' | 'build';
  sourceDetail?: string;
  errorCode?: string;
  errorMessage: string;
  stackTrace?: string;
}

export interface ErrorRecorder {
  record(entry: ErrorRecordEntry): void | Promise<void>;
}

// --- FunctionContext ---

export interface FunctionContext {
  req: Request | undefined;
  db: DatabaseClient;
  env: Record<string, string>;
  app: { name: string };
  mode: 'stable' | 'draft';
  trigger: 'http' | 'cron';
  log: Logger;
  fetch: typeof globalThis.fetch;
  platform: PlatformClient;
}

// --- FunctionModule (internal) ---

export type FunctionHandler = (ctx: FunctionContext) => unknown | Promise<unknown>;

export interface FunctionModule {
  [key: string]: FunctionHandler | undefined;
  default?: FunctionHandler;
  GET?: FunctionHandler;
  POST?: FunctionHandler;
  PUT?: FunctionHandler;
  PATCH?: FunctionHandler;
  DELETE?: FunctionHandler;
  HEAD?: FunctionHandler;
  OPTIONS?: FunctionHandler;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
