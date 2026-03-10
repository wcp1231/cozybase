import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getCozyBaseActions,
  type CozyBaseActionContext,
} from '@cozybase/cozybase-agent';
import { toZodRawShapeFromSchema } from '../operator/schema-to-zod';

function jsonText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function createCozyBaseMcpServer(context: CozyBaseActionContext): McpServer {
  const server = new McpServer(
    { name: 'cozybase', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  for (const action of getCozyBaseActions()) {
    server.registerTool(
      action.name,
      {
        description: action.description,
        inputSchema: toZodRawShapeFromSchema(action.schema as Record<string, unknown>),
      },
      async (args) => jsonText(await action.execute(context, args as never)),
    );
  }

  return server;
}

export function createCozyBaseSdkMcpServer(context: CozyBaseActionContext) {
  return createSdkMcpServer({
    name: 'cozybase',
    version: '0.1.0',
    tools: getCozyBaseActions().map((action) => tool(
      action.name,
      action.description,
      toZodRawShapeFromSchema(action.schema as Record<string, unknown>),
      async (args) => jsonText(await action.execute(context, args as never)),
    )),
  });
}
