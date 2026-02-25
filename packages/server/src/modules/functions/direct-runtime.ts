import { join } from 'path';
import { existsSync } from 'fs';
import type { AppContext } from '../../core/app-context';
import { AppError, NotFoundError } from '../../core/errors';
import type { FunctionRuntime, FunctionModule, HttpMethod } from './types';
import { HTTP_METHODS } from './types';
import { buildFunctionContext } from './context';

export class DirectRuntime implements FunctionRuntime {
  // Cache: appName -> functionName -> module
  private cache = new Map<string, Map<string, FunctionModule>>();
  // Per-app reload timestamps for Stable cache-busting
  private reloadTimestamps = new Map<string, number>();

  async execute(
    app: AppContext,
    functionName: string,
    request: Request,
    mode: 'stable' | 'draft',
  ): Promise<Response> {
    // Validate function name: reject _ prefix and invalid names
    if (functionName.startsWith('_') || !/^[a-zA-Z0-9_-]+$/.test(functionName)) {
      throw new NotFoundError(`Function '${functionName}' not found`);
    }

    // Resolve file path based on mode:
    //   Draft  → workspace source: apps/{name}/functions/
    //   Stable → published snapshot: data/apps/{name}/functions/
    const baseDir = mode === 'draft' ? app.specDir : app.stableDataDir;
    const filePath = join(baseDir, 'functions', `${functionName}.ts`);
    if (!existsSync(filePath)) {
      throw new NotFoundError(`Function '${functionName}' not found`);
    }

    // Load module — errors here are load/syntax errors
    let mod: FunctionModule;
    try {
      mod = await this.loadModule(app.name, functionName, filePath, mode);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const stack = mode === 'draft' && err instanceof Error ? err.stack : undefined;
      return new Response(
        JSON.stringify({ error: { code: 'FUNCTION_LOAD_ERROR', message, stack } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Resolve handler by HTTP method
    const method = request.method.toUpperCase() as HttpMethod;
    const handler = (HTTP_METHODS.includes(method) ? mod[method] : undefined) ?? mod.default;

    if (!handler) {
      return new Response(JSON.stringify({ error: { code: 'METHOD_NOT_ALLOWED', message: `Method ${method} not allowed` } }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Build context and execute — errors here are runtime errors
    const ctx = buildFunctionContext(app, mode, functionName, request);
    try {
      const result = await handler(ctx);
      return this.toResponse(result);
    } catch (err: unknown) {
      if (err instanceof AppError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      const stack = mode === 'draft' && err instanceof Error ? err.stack : undefined;
      return new Response(
        JSON.stringify({ error: { code: 'FUNCTION_ERROR', message, stack } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  async reload(appName: string): Promise<void> {
    this.cache.delete(appName);
    this.reloadTimestamps.set(appName, Date.now());
  }

  async shutdown(): Promise<void> {
    this.cache.clear();
    this.reloadTimestamps.clear();
  }

  private async loadModule(
    appName: string,
    functionName: string,
    filePath: string,
    mode: 'stable' | 'draft',
  ): Promise<FunctionModule> {
    // Draft mode: always reload (cache bust)
    if (mode === 'draft') {
      return await import(filePath + '?t=' + Date.now());
    }

    // Stable mode: use cache with per-app reload timestamps
    let appCache = this.cache.get(appName);
    if (!appCache) {
      appCache = new Map();
      this.cache.set(appName, appCache);
    }

    let mod = appCache.get(functionName);
    if (!mod) {
      const ts = this.reloadTimestamps.get(appName) ?? Date.now();
      mod = await import(filePath + '?t=' + ts);
      appCache.set(functionName, mod!);
    }
    return mod!;
  }

  private toResponse(result: unknown): Response {
    // Response passthrough
    if (result instanceof Response) {
      return result;
    }

    // null/undefined → 204
    if (result === null || result === undefined) {
      return new Response(null, { status: 204 });
    }

    // Object/array → JSON 200
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
