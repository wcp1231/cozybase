/**
 * ClaudeCodeProvider — wraps @anthropic-ai/claude-agent-sdk and converts
 * SDK-specific SDKMessage events into normalized AgentEvent streams.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  Options,
  SDKMessage,
  McpSdkServerConfigWithInstance,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentProvider,
  AgentQuery,
  AgentQueryConfig,
  AgentEvent,
} from '../types.js';

/** Shape of ClaudeCodeProvider-specific options passed via AgentQueryConfig.providerOptions */
export interface ClaudeCodeProviderOptions {
  mcpServers?: Record<string, McpSdkServerConfigWithInstance>;
  tools?: string[];
  allowedTools?: string[];
  permissionMode?: string;
  settingSources?: string[];
}

/**
 * ClaudeCodeProvider constructs AgentQuery instances backed by the
 * @anthropic-ai/claude-agent-sdk query() function.
 *
 * All Claude-SDK-specific message parsing is encapsulated here.
 */
export class ClaudeCodeProvider implements AgentProvider {
  createQuery(config: AgentQueryConfig): AgentQuery {
    const providerOptions = (config.providerOptions ?? {}) as ClaudeCodeProviderOptions;

    const options: Options = {
      model: config.model ?? 'claude-sonnet-4-6',
      cwd: config.cwd,
      permissionMode: (providerOptions.permissionMode as Options['permissionMode']) ?? 'acceptEdits',
      settingSources: (providerOptions.settingSources as Options['settingSources']) ?? ['project'],
    };

    if (config.systemPrompt) {
      options.systemPrompt = config.systemPrompt;
    }
    if (providerOptions.tools) {
      options.tools = providerOptions.tools as Options['tools'];
    }
    if (providerOptions.allowedTools) {
      options.allowedTools = providerOptions.allowedTools;
    }
    if (providerOptions.mcpServers) {
      options.mcpServers = providerOptions.mcpServers;
    }
    if (config.resumeSessionId) {
      options.resume = config.resumeSessionId;
    }

    const sdkQuery = query({ prompt: config.prompt, options });

    return new ClaudeCodeQuery(sdkQuery);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  dispose(): void {
    // No shared resources to release for this provider.
  }
}

/**
 * ClaudeCodeQuery wraps a SDK Query and exposes an AsyncIterable<AgentEvent>.
 *
 * Internal state per query:
 *  - messageCounter: monotonically incrementing integer for stable messageId generation
 *  - currentMessageId: tracks the active streaming message (null when not streaming text)
 *  - toolUseMap: maps toolUseId → toolName for lookup in tool_use_summary
 */
class ClaudeCodeQuery implements AgentQuery {
  private sdkQuery: Query;
  private messageCounter = 0;
  private currentMessageId: string | null = null;
  private toolUseMap = new Map<string, string>();

  constructor(sdkQuery: Query) {
    this.sdkQuery = sdkQuery;
  }

  async interrupt(): Promise<void> {
    await this.sdkQuery.interrupt();
  }

  close(): void {
    this.sdkQuery.close();
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    // Signal that the run has started
    yield { type: 'conversation.run.started' };

    let terminated = false;
    try {
      for await (const msg of this.sdkQuery) {
        for (const event of this.convertMessage(msg)) {
          yield event;
          if (
            event.type === 'conversation.run.completed' ||
            event.type === 'conversation.error'
          ) {
            terminated = true;
          }
        }
      }
    } catch (err) {
      // Normalize SDK-level exceptions (e.g. resume failure) into conversation.error
      yield {
        type: 'conversation.error',
        message: err instanceof Error ? err.message : String(err),
      };
      terminated = true;
    } finally {
      // If no terminal event was emitted (e.g. after interrupt()), emit run.completed
      // with an empty sessionId to allow callers to reset streaming state.
      if (!terminated) {
        yield { type: 'conversation.run.completed', sessionId: '' };
      }
    }
  }

  private *convertMessage(msg: SDKMessage): Iterable<AgentEvent> {
    // ---- user: session resume replay — silently skip ----
    if (msg.type === 'user') {
      return;
    }

    // ---- system: init notice ----
    if (msg.type === 'system') {
      const m = msg as any;
      const tools: string[] = m.tools ?? [];
      const model: string = m.model ?? '';
      yield {
        type: 'conversation.notice',
        message: `Session initialized. Model: ${model}. Tools: ${tools.join(', ')}`,
      };
      return;
    }

    // ---- stream_event: incremental text streaming ----
    if (msg.type === 'stream_event') {
      const event = (msg as any).event;
      if (!event) return;

      // new text block starting — start a new message
      if (event.type === 'content_block_start' && event.content_block?.type === 'text') {
        this.messageCounter += 1;
        this.currentMessageId = `msg-${this.messageCounter}`;
        yield {
          type: 'conversation.message.started',
          messageId: this.currentMessageId,
          role: 'assistant',
        };
        return;
      }

      // text delta — forward as delta
      if (
        event.type === 'content_block_delta' &&
        event.delta?.type === 'text_delta' &&
        this.currentMessageId
      ) {
        yield {
          type: 'conversation.message.delta',
          messageId: this.currentMessageId,
          role: 'assistant',
          delta: event.delta.text ?? '',
        };
      }
      return;
    }

    // ---- assistant: complete message (text + tool_use blocks) ----
    if (msg.type === 'assistant') {
      const content = (msg as any).message?.content;

      if (Array.isArray(content)) {
        // Collect text blocks
        const textBlocks = content.filter((b: any) => b.type === 'text');
        const toolUseBlocks = content.filter((b: any) => b.type === 'tool_use');

        // Emit message.completed for the text content (if any)
        if (textBlocks.length > 0) {
          const combined = textBlocks.map((b: any) => b.text).join('');
          const completedId = this.currentMessageId ?? (() => {
            this.messageCounter += 1;
            return `msg-${this.messageCounter}`;
          })();

          // Emit started first if we never got a stream_event for this message
          if (!this.currentMessageId) {
            yield {
              type: 'conversation.message.started',
              messageId: completedId,
              role: 'assistant',
            };
          }

          yield {
            type: 'conversation.message.completed',
            messageId: completedId,
            role: 'assistant',
            content: combined,
          };
        }

        // Reset current streaming message
        this.currentMessageId = null;

        // Emit tool.started for each tool_use block
        for (const block of toolUseBlocks as any[]) {
          if (block.id && block.name) {
            this.toolUseMap.set(block.id, block.name);
            const toolStarted: AgentEvent = {
              type: 'conversation.tool.started',
              toolUseId: block.id,
              toolName: block.name,
            };
            if (block.input && typeof block.input === 'object') {
              (toolStarted as any).input = block.input;
            }
            yield toolStarted;
          }
        }
      }
      return;
    }

    // ---- tool_progress: intermediate progress ----
    if (msg.type === 'tool_progress') {
      const m = msg as any;
      const toolUseId: string = m.tool_use_id ?? '';
      const toolName: string = m.tool_name ?? this.toolUseMap.get(toolUseId) ?? 'tool';
      yield {
        type: 'conversation.tool.progress',
        toolUseId,
        toolName,
      };
      return;
    }

    // ---- tool_use_summary: tool execution completed ----
    if (msg.type === 'tool_use_summary') {
      const m = msg as any;
      const summary: string = m.summary ?? '';

      // The SDK may use preceding_tool_use_ids (array) or tool_use_id (singular).
      // Fall back to draining all pending toolUseMap entries if neither is present.
      const ids: string[] =
        Array.isArray(m.preceding_tool_use_ids) ? m.preceding_tool_use_ids :
        m.tool_use_id ? [m.tool_use_id] :
        [...this.toolUseMap.keys()];

      for (const toolUseId of ids) {
        const toolName = this.toolUseMap.get(toolUseId) ?? 'tool';
        this.toolUseMap.delete(toolUseId);
        yield {
          type: 'conversation.tool.completed',
          toolUseId,
          toolName,
          summary,
        };
      }
      return;
    }

    // ---- result: run completed or error ----
    if (msg.type === 'result') {
      const m = msg as any;

      // Drain any tool calls that never received a tool_use_summary.
      // This guards against SDK versions that don't emit tool_use_summary.
      for (const [toolUseId, toolName] of this.toolUseMap) {
        yield {
          type: 'conversation.tool.completed',
          toolUseId,
          toolName,
          summary: '',
        };
      }
      this.toolUseMap.clear();

      if (m.is_error) {
        const errors: string[] = m.errors ?? [];
        yield {
          type: 'conversation.error',
          message: errors.join('; ') || 'Agent query failed',
        };
      } else {
        yield {
          type: 'conversation.run.completed',
          sessionId: m.session_id ?? '',
        };
      }
      return;
    }
  }
}
