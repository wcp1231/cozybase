import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

type QueryArgs = { prompt: string; options: Record<string, unknown> };
type FakeSdkQuery = {
  interrupt(): Promise<void>;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
};

const sdkState = {
  calls: [] as QueryArgs[],
  queryImpl: ((_args: QueryArgs) => makeSdkQuery([])) as (args: QueryArgs) => FakeSdkQuery,
};
const originalBunWhich = globalThis.Bun.which;

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query(args: QueryArgs) {
    sdkState.calls.push(args);
    return sdkState.queryImpl(args);
  },
}));

const { ClaudeCodeProvider } = await import('../../../ai-runtime/src/providers/claude-code.ts');

function makeSdkQuery(messages: unknown[], error?: Error): FakeSdkQuery {
  return {
    async interrupt() {},
    close() {},
    async *[Symbol.asyncIterator]() {
      for (const message of messages) {
        yield message;
      }
      if (error) {
        throw error;
      }
    },
  };
}

async function collectEvents(iterable: AsyncIterable<unknown>) {
  const events: unknown[] = [];
  for await (const event of iterable) {
    events.push(event);
  }
  return events;
}

beforeEach(() => {
  sdkState.calls = [];
  sdkState.queryImpl = (_args) => makeSdkQuery([]);
  globalThis.Bun.which = mock(() => null);
});

afterAll(() => {
  globalThis.Bun.which = originalBunWhich;
});

describe('ClaudeCodeProvider', () => {
  test('normalizes SDK exceptions into conversation.error', async () => {
    sdkState.queryImpl = () => makeSdkQuery([], new Error('resume failed'));

    const provider = new ClaudeCodeProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
      resumeSessionId: 'sess-stale',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.error', message: 'resume failed' },
    ]);
  });

  test('emits a synthetic run.completed when the SDK iterator ends without a terminal event', async () => {
    sdkState.queryImpl = () => makeSdkQuery([
      { type: 'system', model: 'claude-sonnet', tools: ['Read'] },
    ]);

    const provider = new ClaudeCodeProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      {
        type: 'conversation.notice',
        message: 'Session initialized. Model: claude-sonnet. Tools: Read',
      },
      { type: 'conversation.run.completed', sessionId: '' },
    ]);
  });

  test('passes resume through only when resumeSessionId is present', async () => {
    sdkState.queryImpl = () => makeSdkQuery([
      { type: 'result', is_error: false, session_id: 'sess-new' },
    ]);

    const provider = new ClaudeCodeProvider();

    await collectEvents(provider.createQuery({
      prompt: 'fresh',
      cwd: '/tmp/cozybase-agent',
    }));
    await collectEvents(provider.createQuery({
      prompt: 'resume',
      cwd: '/tmp/cozybase-agent',
      resumeSessionId: 'sess-old',
    }));

    expect(sdkState.calls).toHaveLength(2);
    expect(sdkState.calls[0]?.options.resume).toBeUndefined();
    expect(sdkState.calls[1]?.options.resume).toBe('sess-old');
  });

  test('does not override the claude executable path', async () => {
    const provider = new ClaudeCodeProvider();
    await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(sdkState.calls[0]?.options.pathToClaudeCodeExecutable).toBeUndefined();
  });

  test('completes tool call when tool_use_summary has empty preceding_tool_use_ids', async () => {
    sdkState.queryImpl = () => makeSdkQuery([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-1', name: 'Read', input: { file: 'a.ts' } }],
        },
      },
      {
        type: 'tool_use_summary',
        summary: 'read done',
        preceding_tool_use_ids: [],
      },
      { type: 'result', is_error: false, session_id: 'sess-1' },
    ]);

    const provider = new ClaudeCodeProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.tool.started', toolUseId: 'tool-1', toolName: 'Read', input: { file: 'a.ts' } },
      { type: 'conversation.tool.completed', toolUseId: 'tool-1', toolName: 'Read', summary: 'read done' },
      { type: 'conversation.run.completed', sessionId: 'sess-1' },
    ]);
  });

  test('completes tool call from user tool_use_result when tool_use_summary is missing', async () => {
    sdkState.queryImpl = () => makeSdkQuery([
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-2', name: 'Bash', input: { command: 'ls' } }],
        },
      },
      {
        type: 'user',
        tool_use_result: {
          tool_use_id: 'tool-2',
          summary: 'command finished',
        },
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' }],
        },
      },
      { type: 'result', is_error: false, session_id: 'sess-2' },
    ]);

    const provider = new ClaudeCodeProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.tool.started', toolUseId: 'tool-2', toolName: 'Bash', input: { command: 'ls' } },
      { type: 'conversation.tool.completed', toolUseId: 'tool-2', toolName: 'Bash', summary: 'command finished' },
      { type: 'conversation.run.completed', sessionId: 'sess-2' },
    ]);
  });
});
