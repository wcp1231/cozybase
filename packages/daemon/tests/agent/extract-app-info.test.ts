import { describe, expect, test } from 'bun:test';
import type { AgentEvent, AgentProvider, AgentQuery, AgentQueryConfig } from '@cozybase/agent';
import { extractAppInfo } from '../../src/agent/extract-app-info';

class StubAgentQuery implements AgentQuery {
  constructor(private readonly events: AgentEvent[]) {}

  async interrupt(): Promise<void> {}
  close(): void {}

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    for (const event of this.events) {
      yield event;
    }
  }
}

class StubAgentProvider implements AgentProvider {
  public lastConfig: AgentQueryConfig | null = null;
  constructor(private readonly events: AgentEvent[]) {}

  createQuery(config: AgentQueryConfig): AgentQuery {
    this.lastConfig = config;
    return new StubAgentQuery(this.events);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {}
}

describe('extractAppInfo', () => {
  test('extracts structured info from assistant JSON text', async () => {
    const provider = new StubAgentProvider([
      { type: 'conversation.run.started' },
      {
        type: 'conversation.message.completed',
        messageId: 'm1',
        role: 'assistant',
        content: '{"slug":"todo-app","displayName":"待办","description":"一个轻量待办应用"}',
      },
      { type: 'conversation.run.completed', sessionId: 'sess-1' },
    ]);

    const result = await extractAppInfo('帮我做个待办', {
      provider,
      cwd: '/tmp/cozybase-agent',
      model: 'gpt-5-codex',
      providerOptions: { codexConfig: { sandbox_mode: 'read-only' } },
    });

    expect(result).toEqual({
      slug: 'todo-app',
      displayName: '待办',
      description: '一个轻量待办应用',
    });
    expect(provider.lastConfig?.prompt).toBe('帮我做个待办');
    expect(provider.lastConfig?.model).toBe('gpt-5-codex');
  });

  test('throws when provider emits conversation.error', async () => {
    const provider = new StubAgentProvider([
      { type: 'conversation.run.started' },
      { type: 'conversation.error', message: 'rate limited' },
    ]);

    await expect(
      extractAppInfo('todo app', {
        provider,
        cwd: '/tmp/cozybase-agent',
      }),
    ).rejects.toThrow('LLM extraction failed: rate limited');
  });
});

