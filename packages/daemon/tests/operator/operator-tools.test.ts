import { describe, expect, test } from 'bun:test';
import { queryDataAction } from '../../../operator-agent/src/tools/query-data';
import { callFunctionAction, createCallFunctionTool } from '../../../operator-agent/src/tools/call-function';
import { createCreateRecordTool, createRecordAction } from '../../../operator-agent/src/tools/create-record';

describe('Operator tools', () => {
  test('query_data normalizes simple SQL-style equality filters into CRUD where syntax', async () => {
    const calls: Array<{ path: string; method?: string }> = [];

    await queryDataAction.execute(
      {
        callApi: async (path, options) => {
          calls.push({
            path,
            method: options?.method,
          });
          return new Response(JSON.stringify({ data: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
      {
        table: 'todo',
        select: 'id,title,completed,created_at',
        where: "title = '添加定时任务'",
        limit: 10,
      },
    );

    expect(calls).toEqual([
      {
        path: '_db/tables/todo?where=title%3Deq.%E6%B7%BB%E5%8A%A0%E5%AE%9A%E6%97%B6%E4%BB%BB%E5%8A%A1&select=id%2Ctitle%2Ccompleted%2Ccreated_at&limit=10',
        method: undefined,
      },
    ]);
  });

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

  test('call_function accepts JSON-string request bodies without double-stringifying them', async () => {
    const calls: Array<{ path: string; method?: string; body?: string }> = [];

    await callFunctionAction.execute(
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
        name: 'todos',
        method: 'POST',
        body: '{"title":"添加定时任务"}',
      },
    );

    expect(calls).toEqual([
      {
        path: 'todos',
        method: 'POST',
        body: '{"title":"添加定时任务"}',
      },
    ]);
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

  test('create_record accepts JSON-string data payloads without collapsing them into invalid request bodies', async () => {
    const calls: Array<{ path: string; method?: string; body?: string }> = [];

    await createRecordAction.execute(
      {
        callApi: async (path, options) => {
          calls.push({
            path,
            method: options?.method,
            body: typeof options?.body === 'string' ? options.body : undefined,
          });
          return new Response(JSON.stringify({ data: { id: '1' } }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        },
      },
      {
        table: 'todo',
        data: '{"title":"添加定时任务","completed":0,"created_at":"2026-03-10 16:37:40"}',
      } as any,
    );

    expect(calls).toEqual([
      {
        path: '_db/tables/todo',
        method: 'POST',
        body: '{"title":"添加定时任务","completed":0,"created_at":"2026-03-10 16:37:40"}',
      },
    ]);
  });
});
