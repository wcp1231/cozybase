import { describe, expect, test } from 'bun:test';
import { CozyBaseAcpEventMapper, mapToolKind } from '../../src/acp/event-mapper';

describe('CozyBaseAcpEventMapper', () => {
  test('maps assistant streaming events to ACP chunks with a stable message id', () => {
    const mapper = new CozyBaseAcpEventMapper();

    expect(mapper.map({ type: 'conversation.run.started' })).toEqual([]);
    expect(mapper.map({
      type: 'conversation.message.started',
      messageId: 'message-1',
      role: 'assistant',
    })).toEqual([]);

    const [firstChunk] = mapper.map({
      type: 'conversation.message.delta',
      messageId: 'message-1',
      role: 'assistant',
      delta: 'Hello',
    });
    const [secondChunk] = mapper.map({
      type: 'conversation.message.delta',
      messageId: 'message-1',
      role: 'assistant',
      delta: ' world',
    });

    expect(firstChunk).toMatchObject({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Hello' },
    });
    expect(secondChunk).toMatchObject({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: ' world' },
    });
    expect(firstChunk.messageId).toBe(secondChunk.messageId);

    expect(mapper.map({
      type: 'conversation.message.completed',
      messageId: 'message-1',
      role: 'assistant',
      content: 'Hello world',
    })).toEqual([]);
  });

  test('maps completed messages, thought chunks, tools, and notices', () => {
    const mapper = new CozyBaseAcpEventMapper();

    const [thoughtChunk] = mapper.map({
      type: 'conversation.message.completed',
      messageId: 'thinking-1',
      role: 'thinking',
      content: 'Need to inspect the workspace first.',
    });
    const [toolStarted] = mapper.map({
      type: 'conversation.tool.started',
      toolUseId: 'tool-1',
      toolName: 'develop_app',
      input: { appSlug: 'blog' },
    });
    const [toolCompleted] = mapper.map({
      type: 'conversation.tool.completed',
      toolUseId: 'tool-1',
      toolName: 'develop_app',
      summary: 'Builder finished the requested change.',
    });
    const [notice] = mapper.map({
      type: 'conversation.notice',
      message: 'Background task finished.',
    });

    expect(thoughtChunk).toMatchObject({
      sessionUpdate: 'agent_thought_chunk',
      content: { type: 'text', text: 'Need to inspect the workspace first.' },
    });
    expect(toolStarted).toMatchObject({
      sessionUpdate: 'tool_call',
      toolCallId: 'tool-1',
      title: 'develop_app',
      kind: 'execute',
      status: 'pending',
    });
    expect(toolCompleted).toMatchObject({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'tool-1',
      status: 'completed',
      rawOutput: { summary: 'Builder finished the requested change.' },
    });
    expect(notice).toMatchObject({
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: 'Background task finished.' },
    });
  });

  test('maps tool names to ACP tool kinds', () => {
    expect(mapToolKind('list_apps')).toBe('read');
    expect(mapToolKind('delete_app')).toBe('delete');
    expect(mapToolKind('bash_command')).toBe('execute');
    expect(mapToolKind('custom_tool')).toBe('other');
  });
});
