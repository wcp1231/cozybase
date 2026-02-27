import type { AppEntry } from '../../registry';
import type { FunctionContext } from './types';
import { SqliteDatabaseClient } from './database-client';
import { FunctionLogger } from './logger';

export function buildFunctionContext(
  entry: AppEntry,
  functionName: string,
  request: Request,
): FunctionContext {
  return {
    req: request,
    db: new SqliteDatabaseClient(entry.db!),
    env: process.env as Record<string, string>,
    app: { name: entry.name },
    mode: entry.mode,
    log: new FunctionLogger(entry.name, functionName, entry.mode),
    fetch: globalThis.fetch,
  };
}
