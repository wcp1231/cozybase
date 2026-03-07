/**
 * MCP Tool Handlers
 *
 * Each handler combines CozybaseBackend operations with Agent working
 * directory management. Handlers use the CozybaseBackend interface,
 * which connects to the daemon via HTTP.
 */

import { readFileSync } from 'fs';

import type { CozybaseBackend } from './types';
import {
  writeAppToDir,
  clearAppDir,
  collectAppFromDir,
  getAppDir,
  assertSafePath,
} from './app-dir';

import type {
  CreateAppInput,
  CreateAppOutput,
  FetchAppInput,
  FetchAppOutput,
  ListAppsOutput,
  UpdateAppInput,
  UpdateAppOutput,
  UpdateAppFileInput,
  UpdateAppFileOutput,
  DeleteAppInput,
  DeleteAppOutput,
  StartAppInput,
  StartAppOutput,
  StopAppInput,
  StopAppOutput,
  RebuildAppInput,
  VerifyAppInput,
  PublishAppInput,
  ExecuteSqlInput,
  ExecuteSqlOutput,
  CallApiInput,
  CallApiOutput,
  GetAppConsoleInput,
  GetAppErrorsInput,
  UiOutlineInput,
  UiGetInput,
  UiInsertInput,
  UiUpdateInput,
  UiMoveInput,
  UiDeleteInput,
  UiBatchInput,
  UiBatchOutput,
  PagesListInput,
  PagesAddInput,
  PagesRemoveInput,
  PagesUpdateInput,
  PagesReorderInput,
} from '../modules/apps/mcp-types';

import {
  getPageOutline,
  getNode,
  insertNode,
  updateNode,
  moveNode,
  deleteNode,
  batchOperations,
  listPages,
  addPage,
  removePage,
  updatePageMeta,
  reorderPage,
  PageEditorError,
} from '../modules/apps/page-editor';

import type { DraftRebuildResult } from '../core/draft-rebuilder';
import type { VerifyResult } from '../core/verifier';
import type { PublishResult } from '../core/publisher';

export interface HandlerContext {
  backend: CozybaseBackend;
  appsDir: string;
}

// --- App Lifecycle ---

export async function handleCreateApp(
  ctx: HandlerContext,
  input: CreateAppInput,
): Promise<CreateAppOutput> {
  const snapshot = await ctx.backend.createApp(input.name, input.description, input.display_name);
  writeAppToDir(ctx.appsDir, snapshot.slug, snapshot.files);

  return {
    slug: snapshot.slug,
    displayName: snapshot.displayName,
    description: snapshot.description,
    directory: getAppDir(ctx.appsDir, snapshot.slug),
    files: snapshot.files.map((f) => f.path),
  };
}

export async function handleListApps(
  ctx: HandlerContext,
): Promise<ListAppsOutput> {
  const apps = await ctx.backend.listApps();
  return {
    apps: apps.map((a) => ({
      slug: a.slug,
      displayName: a.displayName,
      description: a.description,
      stableStatus: a.stableStatus,
      hasDraft: a.hasDraft,
      current_version: a.current_version,
      published_version: a.published_version,
    })),
  };
}

export async function handleFetchApp(
  ctx: HandlerContext,
  input: FetchAppInput,
): Promise<FetchAppOutput> {
  const snapshot = await ctx.backend.fetchApp(input.app_name);

  // Clear and rewrite working directory
  clearAppDir(ctx.appsDir, input.app_name);
  writeAppToDir(ctx.appsDir, input.app_name, snapshot.files);

  return {
    slug: snapshot.slug,
    displayName: snapshot.displayName,
    description: snapshot.description,
    stableStatus: snapshot.stableStatus,
    hasDraft: snapshot.hasDraft,
    current_version: snapshot.current_version,
    published_version: snapshot.published_version,
    directory: getAppDir(ctx.appsDir, input.app_name),
    files: snapshot.files.map((f) => f.path),
  };
}

export async function handleDeleteApp(
  ctx: HandlerContext,
  input: DeleteAppInput,
): Promise<DeleteAppOutput> {
  await ctx.backend.deleteApp(input.app_name);
  clearAppDir(ctx.appsDir, input.app_name);
  return { message: `App '${input.app_name}' has been permanently deleted.` };
}

export async function handleStartApp(
  ctx: HandlerContext,
  input: StartAppInput,
): Promise<StartAppOutput> {
  const app = await ctx.backend.startApp(input.app_name);
  return {
    slug: app.slug,
    displayName: app.displayName,
    stableStatus: app.stableStatus,
    hasDraft: app.hasDraft,
    current_version: app.current_version,
    published_version: app.published_version,
  };
}

export async function handleStopApp(
  ctx: HandlerContext,
  input: StopAppInput,
): Promise<StopAppOutput> {
  const app = await ctx.backend.stopApp(input.app_name);
  return {
    slug: app.slug,
    displayName: app.displayName,
    stableStatus: app.stableStatus,
    hasDraft: app.hasDraft,
    current_version: app.current_version,
    published_version: app.published_version,
  };
}

// --- File Sync ---

export async function handleUpdateApp(
  ctx: HandlerContext,
  input: UpdateAppInput,
): Promise<UpdateAppOutput> {
  const files = collectAppFromDir(ctx.appsDir, input.app_name);
  if (files.length === 0) {
    throw new Error(
      `No files found in working directory for '${input.app_name}'. ` +
      `Run fetch_app first to populate the working directory.`,
    );
  }
  const result = await ctx.backend.pushFiles(input.app_name, files);
  return result;
}

export async function handleUpdateAppFile(
  ctx: HandlerContext,
  input: UpdateAppFileInput,
): Promise<UpdateAppFileOutput> {
  const appDir = getAppDir(ctx.appsDir, input.app_name);
  // Validate path doesn't escape the app directory
  const filePath = assertSafePath(appDir, input.path);
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(
      `File '${input.path}' not found in working directory for '${input.app_name}'.`,
    );
  }

  const result = await ctx.backend.pushFile(input.app_name, input.path, content);
  return { path: input.path, status: result.status, needs_rebuild: result.needs_rebuild };
}

// --- Dev Workflow ---

export async function handleRebuildApp(
  ctx: HandlerContext,
  input: RebuildAppInput,
): Promise<DraftRebuildResult> {
  return ctx.backend.rebuild(input.app_name);
}

export async function handleVerifyApp(
  ctx: HandlerContext,
  input: VerifyAppInput,
): Promise<VerifyResult> {
  return ctx.backend.verify(input.app_name);
}

export async function handlePublishApp(
  ctx: HandlerContext,
  input: PublishAppInput,
): Promise<PublishResult> {
  return ctx.backend.publish(input.app_name);
}

// --- Runtime Interaction ---

export async function handleExecuteSql(
  ctx: HandlerContext,
  input: ExecuteSqlInput,
): Promise<ExecuteSqlOutput> {
  const mode = input.mode ?? 'draft';
  return ctx.backend.executeSql(input.app_name, input.sql, mode);
}

export async function handleCallApi(
  ctx: HandlerContext,
  input: CallApiInput,
): Promise<CallApiOutput> {
  const mode = input.mode ?? 'draft';
  return ctx.backend.callApi(input.app_name, input.method, input.path, input.body, mode);
}

export async function handleGetAppConsole(
  ctx: HandlerContext,
  input: GetAppConsoleInput,
) {
  return ctx.backend.getAppConsole(input.app_name, input.mode ?? 'stable');
}

export async function handleGetAppErrors(
  ctx: HandlerContext,
  input: GetAppErrorsInput,
) {
  return ctx.backend.getAppErrors(
    input.app_name,
    input.mode ?? 'stable',
    input.limit ?? 10,
    input.offset ?? 0,
    input.source_type,
  );
}

// --- UI Component Editing (ui_*) ---

function makePageEditorCtx(ctx: HandlerContext, appName: string) {
  return { appsDir: ctx.appsDir, appName };
}

export function handleUiOutline(
  ctx: HandlerContext,
  input: UiOutlineInput,
): ReturnType<typeof getPageOutline> {
  return getPageOutline(makePageEditorCtx(ctx, input.app_name), input.page_path);
}

export function handleUiGet(
  ctx: HandlerContext,
  input: UiGetInput,
): ReturnType<typeof getNode> {
  return getNode(makePageEditorCtx(ctx, input.app_name), input.node_id);
}

export function handleUiInsert(
  ctx: HandlerContext,
  input: UiInsertInput,
): ReturnType<typeof insertNode> {
  return insertNode(
    makePageEditorCtx(ctx, input.app_name),
    input.parent_id,
    input.node,
    input.index,
  );
}

export function handleUiUpdate(
  ctx: HandlerContext,
  input: UiUpdateInput,
): ReturnType<typeof updateNode> {
  return updateNode(
    makePageEditorCtx(ctx, input.app_name),
    input.node_id,
    input.props,
  );
}

export function handleUiMove(
  ctx: HandlerContext,
  input: UiMoveInput,
): ReturnType<typeof moveNode> {
  return moveNode(
    makePageEditorCtx(ctx, input.app_name),
    input.node_id,
    input.new_parent_id,
    input.index,
  );
}

export function handleUiDelete(
  ctx: HandlerContext,
  input: UiDeleteInput,
): { deleted: string } {
  deleteNode(makePageEditorCtx(ctx, input.app_name), input.node_id);
  return { deleted: input.node_id };
}

export function handleUiBatch(
  ctx: HandlerContext,
  input: UiBatchInput,
): UiBatchOutput {
  return batchOperations(
    makePageEditorCtx(ctx, input.app_name),
    input.operations,
  );
}

// --- Page-level Editing (pages_*) ---

export function handlePagesList(
  ctx: HandlerContext,
  input: PagesListInput,
): ReturnType<typeof listPages> {
  return listPages(makePageEditorCtx(ctx, input.app_name));
}

export function handlePagesAdd(
  ctx: HandlerContext,
  input: PagesAddInput,
): ReturnType<typeof addPage> {
  return addPage(
    makePageEditorCtx(ctx, input.app_name),
    { path: input.path, title: input.title },
    input.index,
  );
}

export function handlePagesRemove(
  ctx: HandlerContext,
  input: PagesRemoveInput,
): { deleted: string } {
  removePage(makePageEditorCtx(ctx, input.app_name), input.page_path);
  return { deleted: input.page_path };
}

export function handlePagesUpdate(
  ctx: HandlerContext,
  input: PagesUpdateInput,
): ReturnType<typeof updatePageMeta> {
  return updatePageMeta(
    makePageEditorCtx(ctx, input.app_name),
    input.page_path,
    { title: input.title },
  );
}

export function handlePagesReorder(
  ctx: HandlerContext,
  input: PagesReorderInput,
): ReturnType<typeof reorderPage> {
  return reorderPage(
    makePageEditorCtx(ctx, input.app_name),
    input.page_path,
    input.index,
  );
}

export { PageEditorError };

// --- UI Inspection ---

export interface InspectUiInput {
  app_name: string;
  page?: string;
}

export async function handleInspectUi(
  ctx: HandlerContext,
  input: InspectUiInput,
): Promise<unknown> {
  return ctx.backend.inspectUi(input.app_name, input.page);
}
