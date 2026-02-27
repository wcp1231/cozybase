import type { AppEntry } from '../../registry';
import { PLATFORM_CALL_DEPTH_HEADER, type PlatformClient } from '../../platform-client';
import type { FunctionContext } from './types';
import { SqliteDatabaseClient } from './database-client';
import { FunctionLogger } from './logger';

export function buildFunctionContext(
  entry: AppEntry,
  functionName: string,
  request: Request,
  platformClient: PlatformClient,
): FunctionContext {
  const functionPlatformClient: PlatformClient = {
    call(target, path, options) {
      const headers = new Headers(options?.headers);
      const inheritedDepth = request.headers.get(PLATFORM_CALL_DEPTH_HEADER);
      if (inheritedDepth && !headers.has(PLATFORM_CALL_DEPTH_HEADER)) {
        headers.set(PLATFORM_CALL_DEPTH_HEADER, inheritedDepth);
      }
      return platformClient.call(target, path, { ...options, headers });
    },
  };

  return {
    req: request,
    db: new SqliteDatabaseClient(entry.db!),
    env: process.env as Record<string, string>,
    app: { name: entry.name },
    mode: entry.mode,
    log: new FunctionLogger(entry.name, functionName, entry.mode),
    fetch: globalThis.fetch,
    platform: functionPlatformClient,
  };
}
