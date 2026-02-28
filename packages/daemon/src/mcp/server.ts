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
  handleUpdateApp,
  handleUpdateAppFile,
  handleReconcileApp,
  handleVerifyApp,
  handlePublishApp,
  handleExecuteSql,
  handleCallApi,
} from './handlers';
import { handleGetGuide } from './guide-handler';

import { TOOL_DESCRIPTIONS } from '../modules/apps/mcp-types';

/**
 * Create and configure a McpServer with all cozybase tools registered.
 */
export function createMcpServer(ctx: HandlerContext): McpServer {
  const server = new McpServer(
    { name: 'cozybase', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  // --- App Lifecycle ---

  server.tool(
    'create_app',
    TOOL_DESCRIPTIONS.create_app,
    { name: z.string(), description: z.string().optional() },
    async (args) => {
      const result = await handleCreateApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'list_apps',
    TOOL_DESCRIPTIONS.list_apps,
    async () => {
      const result = await handleListApps(ctx);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'fetch_app',
    TOOL_DESCRIPTIONS.fetch_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handleFetchApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'delete_app',
    TOOL_DESCRIPTIONS.delete_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handleDeleteApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- File Sync ---

  server.tool(
    'update_app',
    TOOL_DESCRIPTIONS.update_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handleUpdateApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'update_app_file',
    TOOL_DESCRIPTIONS.update_app_file,
    { app_name: z.string(), path: z.string() },
    async (args) => {
      const result = await handleUpdateAppFile(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Dev Workflow ---

  server.tool(
    'reconcile_app',
    TOOL_DESCRIPTIONS.reconcile_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handleReconcileApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'verify_app',
    TOOL_DESCRIPTIONS.verify_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handleVerifyApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'publish_app',
    TOOL_DESCRIPTIONS.publish_app,
    { app_name: z.string() },
    async (args) => {
      const result = await handlePublishApp(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Runtime Interaction ---

  server.tool(
    'execute_sql',
    TOOL_DESCRIPTIONS.execute_sql,
    {
      app_name: z.string(),
      sql: z.string(),
      mode: z.enum(['draft', 'stable']).optional(),
    },
    async (args) => {
      const result = await handleExecuteSql(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  server.tool(
    'call_api',
    TOOL_DESCRIPTIONS.call_api,
    {
      app_name: z.string(),
      method: z.string(),
      path: z.string(),
      body: z.any().optional(),
      mode: z.enum(['draft', 'stable']).optional(),
    },
    async (args) => {
      const result = await handleCallApi(ctx, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );

  // --- Documentation ---

  server.tool(
    'get_guide',
    TOOL_DESCRIPTIONS.get_guide,
    { topic: z.string() },
    async (args) => {
      const content = handleGetGuide(args.topic);
      return { content: [{ type: 'text', text: content }] };
    },
  );

  return server;
}
