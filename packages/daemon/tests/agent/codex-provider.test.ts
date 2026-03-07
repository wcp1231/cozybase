import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

type CodexInitArgs = Record<string, unknown> | undefined;
type ThreadStartArgs = Record<string, unknown> | undefined;
type RunArgs = Record<string, unknown> | undefined;

const sdkState = {
  codexInitCalls: [] as CodexInitArgs[],
  startCalls: [] as ThreadStartArgs[],
  resumeCalls: [] as Array<{ threadId: string; options?: Record<string, unknown> }>,
  runCalls: [] as Array<{ threadId: string; input: string; options?: RunArgs }>,
  startError: null as Error | null,
  resumeError: null as Error | null,
  threadFactory: null as null | ((threadId: string) => any),
  runResult: {
    items: [{ id: 'agent-1', type: 'agent_message', text: 'ok' }],
    finalResponse: 'ok',
    usage: null,
  } as any,
};
const originalBunWhich = globalThis.Bun.which;

mock.module('@openai/codex-sdk', () => ({
  Codex: class {
    constructor(options?: Record<string, unknown>) {
      sdkState.codexInitCalls.push(options);
    }

    startThread(options?: Record<string, unknown>) {
      if (sdkState.startError) throw sdkState.startError;
      sdkState.startCalls.push(options);
      return makeThread('thread-new');
    }

    resumeThread(threadId: string, options?: Record<string, unknown>) {
      if (sdkState.resumeError) throw sdkState.resumeError;
      sdkState.resumeCalls.push({ threadId, options });
      return makeThread(threadId);
    }
  },
}));

const { CodexProvider } = await import('../../../agent/src/providers/codex.ts');

function makeThread(threadId: string) {
  if (sdkState.threadFactory) {
    return sdkState.threadFactory(threadId);
  }
  return {
    id: threadId,
    async run(input: string, options?: Record<string, unknown>) {
      sdkState.runCalls.push({ threadId, input, options });
      return sdkState.runResult;
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
  sdkState.codexInitCalls = [];
  sdkState.startCalls = [];
  sdkState.resumeCalls = [];
  sdkState.runCalls = [];
  sdkState.startError = null;
  sdkState.resumeError = null;
  sdkState.threadFactory = null;
  sdkState.runResult = {
    items: [{ id: 'agent-1', type: 'agent_message', text: 'hello from codex' }],
    finalResponse: 'hello from codex',
    usage: null,
  };
  globalThis.Bun.which = mock(() => null);
});

afterAll(() => {
  globalThis.Bun.which = originalBunWhich;
});

describe('CodexProvider', () => {
  test('starts a new thread and maps run output to conversation events', async () => {
    const provider = new CodexProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'build app',
      systemPrompt: 'system',
      cwd: '/tmp/cozybase-agent',
      model: 'gpt-5-codex',
      providerOptions: {
        codexConfig: {
          approval_policy: 'never',
          sandbox_mode: 'workspace-write',
        },
      },
    }));

    expect(sdkState.codexInitCalls).toEqual([{ config: {
      approval_policy: 'never',
      sandbox_mode: 'workspace-write',
      model: 'gpt-5-codex',
    } }]);
    expect(sdkState.startCalls).toEqual([{ 
      workingDirectory: '/tmp/cozybase-agent',
      model: 'gpt-5-codex',
      sandboxMode: 'workspace-write',
      approvalPolicy: 'never',
    }]);
    expect(sdkState.runCalls[0]?.input).toBe('system\n\nUser request:\nbuild app');
    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.message.started', messageId: 'msg-1', role: 'assistant' },
      {
        type: 'conversation.message.completed',
        messageId: 'msg-1',
        role: 'assistant',
        content: 'hello from codex',
      },
      { type: 'conversation.run.completed', sessionId: 'thread-new' },
    ]);
  });

  test('prefers the user-installed codex CLI when available on PATH', async () => {
    globalThis.Bun.which = mock(() => '/opt/homebrew/bin/codex');

    const provider = new CodexProvider();
    await collectEvents(provider.createQuery({
      prompt: 'build app',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(sdkState.codexInitCalls).toEqual([{
      codexPathOverride: '/opt/homebrew/bin/codex',
      config: {},
    }]);
  });

  test('resumes an existing thread when resumeSessionId is provided', async () => {
    sdkState.runResult = {
      items: [],
      finalResponse: '',
      usage: null,
    };

    const provider = new CodexProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'continue',
      cwd: '/tmp/cozybase-agent',
      resumeSessionId: 'thread-123',
    }));

    expect(sdkState.resumeCalls).toEqual([
      { threadId: 'thread-123', options: { workingDirectory: '/tmp/cozybase-agent' } },
    ]);
    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.run.completed', sessionId: 'thread-123' },
    ]);
  });

  test('normalizes SDK exceptions into conversation.error', async () => {
    sdkState.startError = new Error('missing OPENAI_API_KEY');

    const provider = new CodexProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'hello',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.error', message: 'missing OPENAI_API_KEY' },
    ]);
  });

  test('interrupt triggers underlying thread interrupt and stops the run', async () => {
    let rejectRun: ((reason?: unknown) => void) | null = null;
    let interruptCalls = 0;

    sdkState.threadFactory = (threadId: string) => ({
      id: threadId,
      async run(input: string, options?: Record<string, unknown>) {
        sdkState.runCalls.push({ threadId, input, options });
        return await new Promise((_resolve, reject) => {
          rejectRun = reject;
        });
      },
      async interrupt() {
        interruptCalls += 1;
        rejectRun?.(new Error('aborted'));
      },
    });

    const provider = new CodexProvider();
    const query = provider.createQuery({
      prompt: 'long task',
      cwd: '/tmp/cozybase-agent',
    });
    const iterator = query[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value).toEqual({ type: 'conversation.run.started' });

    const nextEventPromise = iterator.next();
    await query.interrupt();
    const next = await nextEventPromise;

    expect(interruptCalls).toBe(1);
    if (sdkState.runCalls.length > 0) {
      expect((sdkState.runCalls[0]?.options as any)?.signal?.aborted).toBeTrue();
    } else {
      expect(sdkState.runCalls.length).toBe(0);
    }
    expect(next.value).toEqual({ type: 'conversation.run.completed', sessionId: 'thread-new' });
  });

  test('emits message.completed even when completed agent message has empty content', async () => {
    sdkState.threadFactory = (threadId: string) => ({
      id: threadId,
      async runStreamed(_input: string, _options?: Record<string, unknown>) {
        async function* events() {
          yield { type: 'thread.started', thread_id: threadId };
          yield { type: 'item.started', item: { id: 'a1', type: 'agent_message', text: '' } };
          yield { type: 'item.completed', item: { id: 'a1', type: 'agent_message', text: '' } };
        }
        return { events: events() };
      },
      async run() {
        return { items: [], finalResponse: '', usage: null };
      },
    });

    const provider = new CodexProvider();
    const events = await collectEvents(provider.createQuery({
      prompt: 'stream',
      cwd: '/tmp/cozybase-agent',
    }));

    expect(events).toEqual([
      { type: 'conversation.run.started' },
      { type: 'conversation.message.started', messageId: 'msg-1', role: 'assistant' },
      { type: 'conversation.message.completed', messageId: 'msg-1', role: 'assistant', content: '' },
      { type: 'conversation.run.completed', sessionId: 'thread-new' },
    ]);
  });
});
