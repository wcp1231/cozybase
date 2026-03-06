/**
 * LocalBackend — In-process CozybaseBackend implementation.
 *
 * Directly calls Workspace, AppManager, DraftReconciler, Verifier, Publisher,
 * and UiBridge without HTTP roundtrips. Used by the SDK MCP Server running
 * inside the daemon process.
 */

import { join } from 'path';
import type { Hono } from 'hono';
import { AppConsoleService } from '../core/app-console-service';
import type { Workspace } from '../core/workspace';
import type { DraftReconciler } from '../core/draft-reconciler';
import type { Verifier } from '../core/verifier';
import type { Publisher } from '../core/publisher';
import type { ScheduleManager } from '../core/schedule-manager';
import type { UiBridge } from '../core/ui-bridge';
import type { EventBus } from '../core/event-bus';
import { type AppRegistry, validateSql, type SqlMode } from '@cozybase/runtime';
import type { AppManager } from '../modules/apps/manager';
import type {
  CozybaseBackend,
  AppSnapshot,
  AppInfo,
  FileEntry,
  PushResult,
  SqlResult,
  ApiResponse,
  DraftReconcileResult,
  VerifyResult,
  PublishResult,
} from '../mcp/types';

export interface LocalBackendDeps {
  workspace: Workspace;
  appManager: AppManager;
  draftReconciler: DraftReconciler;
  verifier: Verifier;
  publisher: Publisher;
  registry: AppRegistry;
  scheduleManager: ScheduleManager;
  uiBridge: UiBridge;
  honoApp: Hono;
  eventBus?: EventBus;
}

export class LocalBackend implements CozybaseBackend {
  private workspace: Workspace;
  private appManager: AppManager;
  private draftReconciler: DraftReconciler;
  private verifier: Verifier;
  private publisher: Publisher;
  private registry: AppRegistry;
  private scheduleManager: ScheduleManager;
  private appConsole: AppConsoleService;
  private uiBridge: UiBridge;
  private honoApp: Hono;
  private eventBus?: EventBus;

  constructor(deps: LocalBackendDeps) {
    this.workspace = deps.workspace;
    this.appManager = deps.appManager;
    this.draftReconciler = deps.draftReconciler;
    this.verifier = deps.verifier;
    this.publisher = deps.publisher;
    this.registry = deps.registry;
    this.scheduleManager = deps.scheduleManager;
    this.appConsole = new AppConsoleService(deps.workspace, deps.scheduleManager);
    this.uiBridge = deps.uiBridge;
    this.honoApp = deps.honoApp;
    this.eventBus = deps.eventBus;
  }

  // --- App Lifecycle ---

  async createApp(slug: string, description?: string, displayName?: string): Promise<AppSnapshot> {
    const result = await this.appManager.create(slug, description, displayName);
    const app = result.app;
    return {
      slug: app.slug,
      displayName: app.displayName,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
      files: app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async listApps(): Promise<AppInfo[]> {
    const apps = this.appManager.list();
    return apps.map((a) => ({
      slug: a.slug,
      displayName: a.displayName,
      description: a.description,
      stableStatus: a.stableStatus,
      hasDraft: a.hasDraft,
      current_version: a.current_version,
      published_version: a.published_version,
    }));
  }

  async fetchApp(slug: string): Promise<AppSnapshot> {
    const app = this.appManager.getAppWithFiles(slug);
    return {
      slug: app.slug,
      displayName: app.displayName,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
      files: app.files.map((f) => ({ path: f.path, content: f.content })),
    };
  }

  async deleteApp(slug: string): Promise<void> {
    this.appManager.delete(slug);
  }

  async startApp(slug: string): Promise<AppInfo> {
    const app = this.appManager.startStable(slug);
    return {
      slug: app.slug,
      displayName: app.displayName,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
    };
  }

  async stopApp(slug: string): Promise<AppInfo> {
    const app = this.appManager.stopStable(slug);
    return {
      slug: app.slug,
      displayName: app.displayName,
      description: app.description,
      stableStatus: app.stableStatus,
      hasDraft: app.hasDraft,
      current_version: app.current_version,
      published_version: app.published_version,
    };
  }

  // --- File Sync ---

  async pushFiles(slug: string, files: FileEntry[]): Promise<PushResult> {
    // Fetch current version for optimistic lock
    const current = this.appManager.getAppWithFiles(slug);
    const updatedApp = this.appManager.updateApp(
      slug,
      files.map((f) => ({ path: f.path, content: f.content })),
      current.current_version,
    );

    // Compute changes by comparing old and new file sets
    const oldPaths = new Set(current.files.map((f) => f.path));
    const newPaths = new Set(updatedApp.files.map((f) => f.path));
    const oldContentMap = new Map(current.files.map((f) => [f.path, f.content]));

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const f of files) {
      if (!oldPaths.has(f.path)) {
        added.push(f.path);
      } else if (oldContentMap.get(f.path) !== f.content) {
        modified.push(f.path);
      }
    }

    for (const p of oldPaths) {
      if (!newPaths.has(p)) {
        deleted.push(p);
      }
    }

    return {
      files: files.map((f) => f.path),
      changes: { added, modified, deleted },
    };
  }

  async pushFile(slug: string, path: string, content: string): Promise<'created' | 'updated'> {
    const current = this.appManager.getAppWithFiles(slug);
    const existed = current.files.some((f) => f.path === path);
    this.appManager.updateFile(slug, path, content);
    return existed ? 'updated' : 'created';
  }

  // --- Dev Workflow ---

  async reconcile(slug: string): Promise<DraftReconcileResult> {
    this.workspace.refreshAppState(slug);
    const result = await this.draftReconciler.reconcile(slug);

    // Restart draft runtime after reconcile
    const appContext = this.workspace.getOrCreateApp(slug);
    if (result.success && appContext?.hasDraftReconcileState()) {
      this.registry.restart(slug, {
        mode: 'draft',
        dbPath: appContext.draftDbPath,
        functionsDir: join(appContext.draftDataDir, 'functions'),
        uiDir: join(appContext.draftDataDir, 'ui'),
      });
    }

    // Notify listeners (e.g., ChatSession → browser) that reconcile completed
    if (result.success) {
      this.eventBus?.emit('app:reconciled', { appSlug: slug });
    }

    return result;
  }

  async verify(slug: string): Promise<VerifyResult> {
    this.workspace.refreshAppState(slug);
    return this.verifier.verify(slug);
  }

  async publish(slug: string): Promise<PublishResult> {
    this.workspace.refreshAppState(slug);
    const result = await this.publisher.publish(slug);

    if (result.success) {
      this.workspace.refreshAppState(slug);
      const state = this.workspace.getAppState(slug);
      const appContext = this.workspace.getOrCreateApp(slug);

      if (appContext && state?.stableStatus === 'running') {
        this.registry.restart(slug, {
          mode: 'stable',
          dbPath: appContext.stableDbPath,
          functionsDir: join(appContext.stableDataDir, 'functions'),
          uiDir: join(appContext.stableDataDir, 'ui'),
        });
      } else {
        try { this.registry.stop(slug, 'stable'); } catch { /* ignore */ }
      }

      try { this.registry.stop(slug, 'draft'); } catch { /* ignore */ }

      if (state?.stableStatus === 'running') {
        await this.scheduleManager?.reloadApp(slug);
      } else {
        this.scheduleManager?.unloadApp(slug);
      }
    }

    return result;
  }

  // --- Runtime Interaction ---

  async executeSql(slug: string, sql: string, mode: string): Promise<SqlResult> {
    const sqlMode: SqlMode = mode === 'stable' ? 'stable' : 'draft';

    const check = validateSql(sql, sqlMode);
    if (!check.allowed) {
      throw new Error(check.error ?? 'SQL statement not allowed');
    }

    const appContext = this.workspace.getApp(slug);
    if (!appContext) {
      throw new Error(`App '${slug}' not found`);
    }

    const db = sqlMode === 'stable' ? appContext.stableDb : appContext.draftDb;

    const stmt = db.query(sql);
    const rows = stmt.all() as Record<string, unknown>[];

    if (rows.length === 0) {
      return { columns: [], rows: [], rowCount: 0 };
    }

    const columns = Object.keys(rows[0]);
    const limitedRows = rows.slice(0, 1000);
    return {
      columns,
      rows: limitedRows.map((row) => columns.map((col) => row[col])),
      rowCount: rows.length,
    };
  }

  async callApi(
    slug: string,
    method: string,
    path: string,
    body?: unknown,
    mode?: string,
  ): Promise<ApiResponse> {
    const appMode = mode === 'stable' ? 'stable' : 'draft';
    const reqPath = `/${appMode}/apps/${encodeURIComponent(slug)}${path}`;
    const url = `http://localhost${reqPath}`;

    const init: RequestInit = { method: method.toUpperCase() };
    if (body !== undefined && body !== null) {
      init.body = JSON.stringify(body);
      init.headers = { 'Content-Type': 'application/json' };
    }

    const response = await this.honoApp.request(url, init);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let responseBody: unknown;
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      status: response.status,
      headers,
      body: responseBody,
    };
  }

  async getAppConsole(slug: string, mode?: string) {
    return this.appConsole.getConsoleOverview(slug, mode === 'draft' ? 'draft' : 'stable');
  }

  async getAppErrors(
    slug: string,
    mode?: string,
    limit?: number,
    offset?: number,
    sourceType?: string,
  ) {
    return this.appConsole.getErrors(slug, mode === 'draft' ? 'draft' : 'stable', {
      limit,
      offset,
      sourceType: sourceType === 'http_function' || sourceType === 'schedule' || sourceType === 'build'
        ? sourceType
        : undefined,
    });
  }

  async getAppSchedules(slug: string, mode?: string) {
    return this.appConsole.getSchedules(slug, mode === 'draft' ? 'draft' : 'stable');
  }

  async getAppScheduleRuns(
    slug: string,
    scheduleName: string,
    mode?: string,
    limit?: number,
  ) {
    return this.appConsole.getScheduleRuns(
      slug,
      scheduleName,
      mode === 'draft' ? 'draft' : 'stable',
      limit ?? 20,
    );
  }

  // --- UI Inspection ---

  async inspectUi(appSlug: string, page?: string): Promise<unknown> {
    return this.uiBridge.inspectUi(appSlug, page);
  }
}
