import type { AppContext } from '../../core/app-context';
import type { FunctionContext } from './types';
import { SqliteDatabaseClient } from './database-client';
import { FunctionLogger } from './logger';

export function buildFunctionContext(
  app: AppContext,
  mode: 'stable' | 'draft',
  functionName: string,
  request: Request,
): FunctionContext {
  const db = mode === 'stable' ? app.stableDb : app.draftDb;

  return {
    req: request,
    db: new SqliteDatabaseClient(db),
    env: process.env as Record<string, string>,
    app: { name: app.name },
    mode,
    log: new FunctionLogger(app.name, functionName, mode),
    fetch: globalThis.fetch,
  };
}
