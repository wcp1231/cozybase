import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { getOperatorActions, type CallApiFn } from '@cozybase/operator-agent';
import { toZodRawShapeFromSchema } from './schema-to-zod';

function jsonText(result: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
  };
}

export function createOperatorSdkMcpServer(callApi: CallApiFn) {
  return createSdkMcpServer({
    name: 'operator',
    version: '0.1.0',
    tools: getOperatorActions().map((action) => tool(
      action.name,
      action.description,
      toZodRawShapeFromSchema(action.schema as Record<string, unknown>),
      async (args) => jsonText(await action.execute({ callApi }, args as never)),
    )),
  });
}
