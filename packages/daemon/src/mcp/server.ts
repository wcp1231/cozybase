/**
 * MCP Server Setup
 *
 * Creates a McpServer instance, registers all tools with Zod input
 * schemas, and wires them to the corresponding handler functions.
 */

import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { HandlerContext } from './handlers';
import {
  handleCreateApp,
  handleListApps,
  handleFetchApp,
  handleDeleteApp,
  handleStartApp,
  handleStopApp,
  handleUpdateApp,
  handleUpdateAppFile,
  handleReconcileApp,
  handleVerifyApp,
  handlePublishApp,
  handleExecuteSql,
  handleCallApi,
  handleGetAppConsole,
  handleGetAppErrors,
  handleInspectUi,
  handleUiOutline,
  handleUiGet,
  handleUiInsert,
  handleUiUpdate,
  handleUiMove,
  handleUiDelete,
  handleUiBatch,
  handlePagesList,
  handlePagesAdd,
  handlePagesRemove,
  handlePagesUpdate,
  handlePagesReorder,
} from './handlers';
import { handleGetGuide } from './guide-handler';
import { batchOperationSchema } from './ui-batch-schema';

import { TOOL_DESCRIPTIONS } from '../modules/apps/mcp-types';

function jsonText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

/**
 * Create and configure a McpServer with all cozybase tools registered.
 */
export function createMcpServer(ctx: HandlerContext): McpServer {
  const server = new McpServer(
    { name: 'cozybase', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // --- App Lifecycle ---

  server.registerTool(
    'create_app',
    {
      description: TOOL_DESCRIPTIONS.create_app,
      inputSchema: { name: z.string(), description: z.string().optional() },
    },
    async (args) => {
      return jsonText(await handleCreateApp(ctx, args));
    },
  );

  server.registerTool(
    'list_apps',
    {
      description: TOOL_DESCRIPTIONS.list_apps,
      inputSchema: {},
    },
    async () => {
      return jsonText(await handleListApps(ctx));
    },
  );

  server.registerTool(
    'fetch_app',
    {
      description: TOOL_DESCRIPTIONS.fetch_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleFetchApp(ctx, args));
    },
  );

  server.registerTool(
    'delete_app',
    {
      description: TOOL_DESCRIPTIONS.delete_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleDeleteApp(ctx, args));
    },
  );

  server.registerTool(
    'start_app',
    {
      description: TOOL_DESCRIPTIONS.start_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleStartApp(ctx, args));
    },
  );

  server.registerTool(
    'stop_app',
    {
      description: TOOL_DESCRIPTIONS.stop_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleStopApp(ctx, args));
    },
  );

  // --- File Sync ---

  server.registerTool(
    'update_app',
    {
      description: TOOL_DESCRIPTIONS.update_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleUpdateApp(ctx, args));
    },
  );

  server.registerTool(
    'update_app_file',
    {
      description: TOOL_DESCRIPTIONS.update_app_file,
      inputSchema: { app_name: z.string(), path: z.string() },
    },
    async (args) => {
      return jsonText(await handleUpdateAppFile(ctx, args));
    },
  );

  // --- Dev Workflow ---

  server.registerTool(
    'reconcile_app',
    {
      description: TOOL_DESCRIPTIONS.reconcile_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleReconcileApp(ctx, args));
    },
  );

  server.registerTool(
    'verify_app',
    {
      description: TOOL_DESCRIPTIONS.verify_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handleVerifyApp(ctx, args));
    },
  );

  server.registerTool(
    'publish_app',
    {
      description: TOOL_DESCRIPTIONS.publish_app,
      inputSchema: { app_name: z.string() },
    },
    async (args) => {
      return jsonText(await handlePublishApp(ctx, args));
    },
  );

  // --- Runtime Interaction ---

  server.registerTool(
    'execute_sql',
    {
      description: TOOL_DESCRIPTIONS.execute_sql,
      inputSchema: {
        app_name: z.string(),
        sql: z.string(),
        mode: z.enum(['draft', 'stable']).optional(),
      },
    },
    async (args) => {
      return jsonText(await handleExecuteSql(ctx, args));
    },
  );

  server.registerTool(
    'call_api',
    {
      description: TOOL_DESCRIPTIONS.call_api,
      inputSchema: {
        app_name: z.string(),
        method: z.string(),
        path: z.string(),
        body: z.any().optional(),
        mode: z.enum(['draft', 'stable']).optional(),
      },
    },
    async (args) => {
      return jsonText(await handleCallApi(ctx, args));
    },
  );

  server.registerTool(
    'get_app_console',
    {
      description: TOOL_DESCRIPTIONS.get_app_console,
      inputSchema: {
        app_name: z.string(),
        mode: z.enum(['draft', 'stable']).optional(),
      },
    },
    async (args) => {
      return jsonText(await handleGetAppConsole(ctx, args));
    },
  );

  server.registerTool(
    'get_app_errors',
    {
      description: TOOL_DESCRIPTIONS.get_app_errors,
      inputSchema: {
        app_name: z.string(),
        mode: z.enum(['draft', 'stable']).optional(),
        limit: z.number().int().positive().optional(),
        source_type: z.enum(['http_function', 'schedule', 'build']).optional(),
      },
    },
    async (args) => {
      return jsonText(await handleGetAppErrors(ctx, args));
    },
  );

  // --- Documentation ---

  server.registerTool(
    'get_guide',
    {
      description: TOOL_DESCRIPTIONS.get_guide,
      inputSchema: { topic: z.string() },
    },
    async (args) => {
      const content = handleGetGuide(args.topic);
      return { content: [{ type: 'text', text: content }] };
    },
  );

  // --- UI Inspection ---

  server.registerTool(
    'inspect_ui',
    {
      description: TOOL_DESCRIPTIONS.inspect_ui,
      inputSchema: {
        app_name: z.string(),
        page: z.string().optional(),
      },
    },
    async (args) => {
      return jsonText(await handleInspectUi(ctx, args));
    },
  );

  // --- UI Component Editing (ui_*) ---

  server.registerTool(
    'ui_outline',
    {
      description: TOOL_DESCRIPTIONS.ui_outline,
      inputSchema: { app_name: z.string(), page_id: z.string().optional() },
    },
    (args) => {
      return jsonText(handleUiOutline(ctx, args));
    },
  );

  server.registerTool(
    'ui_get',
    {
      description: TOOL_DESCRIPTIONS.ui_get,
      inputSchema: { app_name: z.string(), node_id: z.string() },
    },
    (args) => {
      return jsonText(handleUiGet(ctx, args));
    },
  );

  server.registerTool(
    'ui_insert',
    {
      description: TOOL_DESCRIPTIONS.ui_insert,
      inputSchema: {
        app_name: z.string(),
        parent_id: z.string(),
        node: z.record(z.unknown()),
        index: z.number().int().nonnegative().optional(),
      },
    },
    (args) => {
      return jsonText(handleUiInsert(ctx, args));
    },
  );

  server.registerTool(
    'ui_update',
    {
      description: TOOL_DESCRIPTIONS.ui_update,
      inputSchema: {
        app_name: z.string(),
        node_id: z.string(),
        props: z.record(z.unknown()),
      },
    },
    (args) => {
      return jsonText(handleUiUpdate(ctx, args));
    },
  );

  server.registerTool(
    'ui_move',
    {
      description: TOOL_DESCRIPTIONS.ui_move,
      inputSchema: {
        app_name: z.string(),
        node_id: z.string(),
        new_parent_id: z.string(),
        index: z.number().int().nonnegative().optional(),
      },
    },
    (args) => {
      return jsonText(handleUiMove(ctx, args));
    },
  );

  server.registerTool(
    'ui_delete',
    {
      description: TOOL_DESCRIPTIONS.ui_delete,
      inputSchema: { app_name: z.string(), node_id: z.string() },
    },
    (args) => {
      return jsonText(handleUiDelete(ctx, args));
    },
  );

  server.registerTool(
    'ui_batch',
    {
      description: TOOL_DESCRIPTIONS.ui_batch,
      inputSchema: {
        app_name: z.string(),
        operations: z.array(batchOperationSchema),
      },
    },
    (args) => {
      return jsonText(handleUiBatch(ctx, args));
    },
  );

  // --- Page-level Editing (pages_*) ---

  server.registerTool(
    'pages_list',
    {
      description: TOOL_DESCRIPTIONS.pages_list,
      inputSchema: { app_name: z.string() },
    },
    (args) => {
      return jsonText(handlePagesList(ctx, args));
    },
  );

  server.registerTool(
    'pages_add',
    {
      description: TOOL_DESCRIPTIONS.pages_add,
      inputSchema: {
        app_name: z.string(),
        id: z.string(),
        title: z.string(),
        index: z.number().int().nonnegative().optional(),
      },
    },
    (args) => {
      return jsonText(handlePagesAdd(ctx, args));
    },
  );

  server.registerTool(
    'pages_remove',
    {
      description: TOOL_DESCRIPTIONS.pages_remove,
      inputSchema: { app_name: z.string(), page_id: z.string() },
    },
    (args) => {
      return jsonText(handlePagesRemove(ctx, args));
    },
  );

  server.registerTool(
    'pages_update',
    {
      description: TOOL_DESCRIPTIONS.pages_update,
      inputSchema: {
        app_name: z.string(),
        page_id: z.string(),
        title: z.string(),
      },
    },
    (args) => {
      return jsonText(handlePagesUpdate(ctx, args));
    },
  );

  server.registerTool(
    'pages_reorder',
    {
      description: TOOL_DESCRIPTIONS.pages_reorder,
      inputSchema: {
        app_name: z.string(),
        page_id: z.string(),
        index: z.number().int().nonnegative(),
      },
    },
    (args) => {
      return jsonText(handlePagesReorder(ctx, args));
    },
  );

  return server;
}
