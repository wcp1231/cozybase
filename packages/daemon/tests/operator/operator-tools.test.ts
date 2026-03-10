import { describe, expect, test } from 'bun:test';
import { callFunctionAction, createCallFunctionTool } from '../../../operator-agent/src/tools/call-function';
import { createCreateRecordTool } from '../../../operator-agent/src/tools/create-record';

describe('Operator tools', () => {
  test('call_function accepts /fn-prefixed function names', async () => {
    const calls: Array<{ path: string; method?: string; body?: string }> = [];

    const result = await callFunctionAction.execute(
      {
        callApi: async (path, options) => {
          calls.push({
            path,
            method: options?.method,
            body: typeof options?.body === 'string' ? options.body : undefined,
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
      {
        name: '/fn/send-email',
        method: 'POST',
        body: { subject: 'Hello' },
      },
    );

    expect(calls).toEqual([
      {
        path: 'send-email',
        method: 'POST',
        body: JSON.stringify({ subject: 'Hello' }),
      },
    ]);
    expect(result).toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  test('call_function returns actionable hints when the function is missing', async () => {
    const tool = createCallFunctionTool(async () => new Response(
          JSON.stringify({ error: { code: 'NOT_FOUND', message: "Function 'missing-job' not found" } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ));

    await expect(tool.execute({
        name: 'missing-job',
        method: 'POST',
      })).rejects.toThrow(
      'call_function failed: HTTP 404 NOT_FOUND: Function \'missing-job\' not found Hint: Use the published function name from the prompt. The name may be passed as "send-email" or "/fn/send-email"',
    );
  });

  test('create_record returns actionable hints when data is empty', async () => {
    const tool = createCreateRecordTool(async () => new Response(
          JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'Request body must include at least one field' } }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        ));

    await expect(tool.execute({
        table: 'todos',
        data: {},
      })).rejects.toThrow(
      'create_record failed: HTTP 400 BAD_REQUEST: Request body must include at least one field Hint: Pass a non-empty data object with concrete column values, for example {"title":"Buy milk"}',
    );
  });
});
