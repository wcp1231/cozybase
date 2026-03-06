import { join } from 'path';
import { existsSync } from 'fs';
import type { AppEntry } from '../../registry';
import type { PlatformClient } from '../../platform-client';
import type { FunctionModule, HttpMethod } from './types';
import { HTTP_METHODS } from './types';
import { buildFunctionContext } from './context';

const FUNCTION_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

export interface FunctionReference {
  functionName: string;
  exportName?: string;
}

export interface ExecuteFunctionReferenceOptions {
  request?: Request;
  trigger?: 'http' | 'cron';
}

/**
 * Load and execute a function from an AppEntry's functionsDir.
 * Handles module loading, caching (stable mode), and response conversion.
 */
export async function executeFunction(
  entry: AppEntry,
  functionName: string,
  request: Request,
  platformClient: PlatformClient,
): Promise<Response> {
  // Validate function name: reject _ prefix and invalid names
  if (functionName.startsWith('_') || !isValidFunctionName(functionName)) {
    return jsonError(404, 'NOT_FOUND', `Function '${functionName}' not found`);
  }

  let mod: FunctionModule;
  try {
    mod = await loadFunctionModule(entry, functionName);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : `Function '${functionName}' not found`;
    if (!existsSync(join(entry.functionsDir, `${functionName}.ts`))) {
      return jsonError(404, 'NOT_FOUND', `Function '${functionName}' not found`);
    }
    const stack = entry.mode === 'draft' && err instanceof Error ? err.stack : undefined;
    return jsonError(500, 'FUNCTION_LOAD_ERROR', message, stack);
  }

  // Resolve handler by HTTP method
  const method = request.method.toUpperCase() as HttpMethod;
  const handler = (HTTP_METHODS.includes(method) ? mod[method] : undefined) ?? mod.default;

  if (!handler) {
    return jsonError(405, 'METHOD_NOT_ALLOWED', `Method ${method} not allowed`);
  }

  // Build context and execute
  const ctx = buildFunctionContext(entry, functionName, platformClient, {
    request,
    trigger: 'http',
  });
  try {
    const result = await handler(ctx);
    return toFunctionResponse(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = entry.mode === 'draft' && err instanceof Error ? err.stack : undefined;
    return jsonError(500, 'FUNCTION_ERROR', message, stack);
  }
}

/**
 * Execute a function by direct export reference (e.g. file + exportName), without HTTP routing.
 * Used by the schedule subsystem.
 */
export async function executeFunctionReference(
  entry: AppEntry,
  reference: FunctionReference,
  platformClient: PlatformClient,
  options: ExecuteFunctionReferenceOptions = {},
): Promise<unknown> {
  const { functionName } = reference;
  if (!isValidFunctionName(functionName)) {
    throw new Error(`Invalid function name '${functionName}'`);
  }

  const mod = await loadFunctionModule(entry, functionName);
  const exportName = reference.exportName ?? 'default';
  const handler = mod[exportName];

  if (!handler) {
    throw new Error(`Export '${exportName}' not found in function '${functionName}'`);
  }

  const ctx = buildFunctionContext(entry, functionName, platformClient, {
    request: options.request,
    trigger: options.trigger ?? 'cron',
  });

  return await handler(ctx);
}

export async function loadFunctionModule(
  entry: AppEntry,
  functionName: string,
): Promise<FunctionModule> {
  const filePath = join(entry.functionsDir, `${functionName}.ts`);
  if (!existsSync(filePath)) {
    throw new Error(`Function '${functionName}' not found`);
  }

  // Draft mode: always reload (cache bust)
  if (entry.mode === 'draft') {
    return await import(filePath + '?t=' + Date.now());
  }

  // Stable mode: use moduleCache from entry
  let mod = entry.moduleCache.get(functionName);
  if (!mod) {
    mod = await import(filePath + '?t=' + Date.now());
    entry.moduleCache.set(functionName, mod!);
  }
  return mod!;
}

export function toFunctionResponse(result: unknown): Response {
  if (result instanceof Response) {
    return result;
  }
  if (result === null || result === undefined) {
    return new Response(null, { status: 204 });
  }
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, code: string, message: string, stack?: string): Response {
  return new Response(
    JSON.stringify({ error: { code, message, ...(stack ? { stack } : {}) } }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

function isValidFunctionName(functionName: string): boolean {
  return FUNCTION_NAME_PATTERN.test(functionName);
}
