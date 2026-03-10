import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  getOperatorActions,
  type CallApiFn,
} from '@cozybase/operator-agent';
import { toZodRawShapeFromSchema } from './schema-to-zod';

function jsonText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function createOperatorMcpServer(callApi: CallApiFn): McpServer {
  const server = new McpServer(
    { name: 'operator', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  for (const action of getOperatorActions()) {
    server.registerTool(
      action.name,
      {
        description: action.description,
        inputSchema: toZodRawShapeFromSchema(action.schema as Record<string, unknown>),
      },
      async (args) => jsonText(await action.execute({ callApi }, args as never)),
    );
  }

  return server;
}
