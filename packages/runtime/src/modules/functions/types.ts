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

// --- FunctionContext ---

export interface FunctionContext {
  req: Request;
  db: DatabaseClient;
  env: Record<string, string>;
  app: { name: string };
  mode: 'stable' | 'draft';
  log: Logger;
  fetch: typeof globalThis.fetch;
}

// --- FunctionModule (internal) ---

export interface FunctionModule {
  default?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  GET?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  POST?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  PUT?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  PATCH?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  DELETE?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  HEAD?: (ctx: FunctionContext) => unknown | Promise<unknown>;
  OPTIONS?: (ctx: FunctionContext) => unknown | Promise<unknown>;
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
