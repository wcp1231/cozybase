/**
 * SDK MCP Server — In-process MCP server for the Claude Agent SDK.
 *
 * Uses createSdkMcpServer() + tool() to register all Cozybase MCP tools.
 * Reuses existing TOOL_DESCRIPTIONS, Zod schemas, and handler functions.
 */

import { z } from 'zod';
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

import type { HandlerContext } from '../mcp/handlers';
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
} from '../mcp/handlers';
import { handleGetGuide } from '../mcp/guide-handler';

import { TOOL_DESCRIPTIONS } from '../modules/apps/mcp-types';

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Create an in-process SDK MCP Server with all Cozybase tools registered.
 */
export function createCozybaseSdkMcpServer(ctx: HandlerContext) {
  return createSdkMcpServer({
    name: 'cozybase',
    version: '0.1.0',
    tools: [
      // --- App Lifecycle ---
      tool(
        'create_app',
        TOOL_DESCRIPTIONS.create_app,
        { name: z.string(), description: z.string().optional() },
        async (args) => jsonResult(await handleCreateApp(ctx, args)),
      ),

      tool(
        'list_apps',
        TOOL_DESCRIPTIONS.list_apps,
        {},
        async () => jsonResult(await handleListApps(ctx)),
      ),

      tool(
        'fetch_app',
        TOOL_DESCRIPTIONS.fetch_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleFetchApp(ctx, args)),
      ),

      tool(
        'delete_app',
        TOOL_DESCRIPTIONS.delete_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleDeleteApp(ctx, args)),
      ),

      tool(
        'start_app',
        TOOL_DESCRIPTIONS.start_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleStartApp(ctx, args)),
      ),

      tool(
        'stop_app',
        TOOL_DESCRIPTIONS.stop_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleStopApp(ctx, args)),
      ),

      // --- File Sync ---
      tool(
        'update_app',
        TOOL_DESCRIPTIONS.update_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleUpdateApp(ctx, args)),
      ),

      tool(
        'update_app_file',
        TOOL_DESCRIPTIONS.update_app_file,
        { app_name: z.string(), path: z.string() },
        async (args) => jsonResult(await handleUpdateAppFile(ctx, args)),
      ),

      // --- Dev Workflow ---
      tool(
        'reconcile_app',
        TOOL_DESCRIPTIONS.reconcile_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleReconcileApp(ctx, args)),
      ),

      tool(
        'verify_app',
        TOOL_DESCRIPTIONS.verify_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handleVerifyApp(ctx, args)),
      ),

      tool(
        'publish_app',
        TOOL_DESCRIPTIONS.publish_app,
        { app_name: z.string() },
        async (args) => jsonResult(await handlePublishApp(ctx, args)),
      ),

      // --- Runtime Interaction ---
      tool(
        'execute_sql',
        TOOL_DESCRIPTIONS.execute_sql,
        {
          app_name: z.string(),
          sql: z.string(),
          mode: z.enum(['draft', 'stable']).optional(),
        },
        async (args) => jsonResult(await handleExecuteSql(ctx, args)),
      ),

      tool(
        'call_api',
        TOOL_DESCRIPTIONS.call_api,
        {
          app_name: z.string(),
          method: z.string(),
          path: z.string(),
          body: z.any().optional(),
          mode: z.enum(['draft', 'stable']).optional(),
        },
        async (args) => jsonResult(await handleCallApi(ctx, args)),
      ),

      // --- UI Inspection ---
      tool(
        'inspect_ui',
        TOOL_DESCRIPTIONS.inspect_ui,
        {
          app_name: z.string(),
          page: z.string().optional(),
        },
        async (args) => jsonResult(await handleInspectUi(ctx, args)),
      ),

      // --- Documentation ---
      tool(
        'get_guide',
        TOOL_DESCRIPTIONS.get_guide,
        { topic: z.string() },
        async (args) => {
          const content = handleGetGuide(args.topic);
          return { content: [{ type: 'text' as const, text: content }] };
        },
      ),
    ],
  });
}
