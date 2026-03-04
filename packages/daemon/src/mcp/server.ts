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
  handleInspectUi,
  handlePageOutline,
  handlePageGet,
  handlePageInsert,
  handlePageUpdate,
  handlePageMove,
  handlePageDelete,
} from './handlers';
import { handleGetGuide } from './guide-handler';

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

  // --- Page Editing ---

  server.registerTool(
    'page_outline',
    {
      description: TOOL_DESCRIPTIONS.page_outline,
      inputSchema: { app_name: z.string(), page_id: z.string().optional() },
    },
    (args) => {
      return jsonText(handlePageOutline(ctx, args));
    },
  );

  server.registerTool(
    'page_get',
    {
      description: TOOL_DESCRIPTIONS.page_get,
      inputSchema: { app_name: z.string(), node_id: z.string() },
    },
    (args) => {
      return jsonText(handlePageGet(ctx, args));
    },
  );

  server.registerTool(
    'page_insert',
    {
      description: TOOL_DESCRIPTIONS.page_insert,
      inputSchema: {
        app_name: z.string(),
        parent_id: z.string(),
        node: z.record(z.unknown()),
        index: z.number().int().nonnegative().optional(),
      },
    },
    (args) => {
      return jsonText(handlePageInsert(ctx, args));
    },
  );

  server.registerTool(
    'page_update',
    {
      description: TOOL_DESCRIPTIONS.page_update,
      inputSchema: {
        app_name: z.string(),
        node_id: z.string(),
        props: z.record(z.unknown()),
      },
    },
    (args) => {
      return jsonText(handlePageUpdate(ctx, args));
    },
  );

  server.registerTool(
    'page_move',
    {
      description: TOOL_DESCRIPTIONS.page_move,
      inputSchema: {
        app_name: z.string(),
        node_id: z.string(),
        new_parent_id: z.string(),
        index: z.number().int().nonnegative().optional(),
      },
    },
    (args) => {
      return jsonText(handlePageMove(ctx, args));
    },
  );

  server.registerTool(
    'page_delete',
    {
      description: TOOL_DESCRIPTIONS.page_delete,
      inputSchema: { app_name: z.string(), node_id: z.string() },
    },
    (args) => {
      return jsonText(handlePageDelete(ctx, args));
    },
  );

  return server;
}
