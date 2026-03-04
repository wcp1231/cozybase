import { beforeEach, describe, expect, mock, test } from 'bun:test';

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

mock.module('@anthropic-ai/claude-agent-sdk', () => ({
  query(args: QueryArgs) {
    sdkState.calls.push(args);
    return sdkState.queryImpl(args);
  },
}));

const { ClaudeCodeProvider } = await import('../../../agent/src/providers/claude-code.ts');

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
});
