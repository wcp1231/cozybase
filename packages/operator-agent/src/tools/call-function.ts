import { Type } from '@sinclair/typebox';
import { callJsonApiDetailed, encodeJsonBody } from '../http';
import type { CallApiFn } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { bindAction } from './shared';

const HttpMethodSchema = Type.Union([
  Type.Literal('GET'),
  Type.Literal('POST'),
  Type.Literal('PUT'),
  Type.Literal('PATCH'),
  Type.Literal('DELETE'),
]);

const CallFunctionSchema = Type.Object({
  name: Type.String({ minLength: 1 }),
  method: Type.Optional(HttpMethodSchema),
  body: Type.Optional(Type.Any()),
});

export const callFunctionAction: OperatorActionDefinition<typeof CallFunctionSchema> = {
  name: 'call_function',
  description: '调用当前 APP 已发布的自定义 function。',
  schema: CallFunctionSchema,
  async execute({ callApi }, input) {
    const method = input.method ?? 'POST';
    const functionName = normalizeFunctionName(input.name);
    const result = await callJsonApiDetailed(
      callApi,
      functionName,
      {
        method,
        headers: input.body === undefined ? undefined : {
          'Content-Type': 'application/json',
        },
        body: encodeJsonBody(input.body),
      },
    );
    return {
      status: result.status,
      body: result.payload,
    };
  },
};

export function createCallFunctionTool(callApi: CallApiFn) {
  return bindAction(callFunctionAction, callApi);
}

function normalizeFunctionName(value: string): string {
  const trimmed = value.trim();
  const withoutProtocol = trimmed.replace(/^https?:\/\/[^/]+/i, '');
  const withoutLeadingSlash = withoutProtocol.replace(/^\/+/, '');
  const withoutFnPrefix = withoutLeadingSlash.replace(/^fn\/+/, '');
  return withoutFnPrefix;
}
