/**
 * ClaudeCodeProvider — wraps @anthropic-ai/claude-agent-sdk and converts
 * SDK-specific SDKMessage events into normalized AgentEvent streams.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  Options,
  SDKMessage,
  McpServerConfig,
} from '@anthropic-ai/claude-agent-sdk';
import type {
  AgentProvider,
  AgentQuery,
  AgentQueryConfig,
  AgentEvent,
  AgentRuntimeProvider,
  AgentRuntimeSession,
  AgentSessionSpec,
} from '../types.js';
import { QueryBackedRuntimeSession } from '../runtime-session.js';

/** Shape of ClaudeCodeProvider-specific options passed via AgentQueryConfig.providerOptions */
export interface ClaudeCodeProviderOptions {
  mcpServers?: Record<string, McpServerConfig>;
  tools?: string[];
  allowedTools?: string[];
  permissionMode?: string;
  settingSources?: string[];
  debug?: boolean;
  debugFile?: string;
  stderr?: (data: string) => void;
  spawnClaudeCodeProcess?: Options['spawnClaudeCodeProcess'];
}

function resolveUserInstalledCommand(
  commandName: string,
  explicitEnvVar: string,
): string | undefined {
  const explicitPath = process.env[explicitEnvVar]?.trim();
  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const resolvedFromPath = Bun.which(commandName);
  if (resolvedFromPath) {
    return resolvedFromPath;
  }

  const home = homedir();
  const commonCandidates = [
    join(home, '.bun', 'bin', commandName),
    join('/opt/homebrew/bin', commandName),
    join('/usr/local/bin', commandName),
  ];

  return commonCandidates.find((candidate) => existsSync(candidate));
}

function resolveClaudeDebugFilePath(): string | undefined {
  const workspaceDir = process.env.COZYBASE_WORKSPACE?.trim();
  if (workspaceDir) {
    return join(workspaceDir, 'logs', 'claude-code.debug.log');
  }

  const homeDir = process.env.HOME?.trim();
  if (homeDir) {
    return join(homeDir, '.cozybase', 'logs', 'claude-code.debug.log');
  }

  return undefined;
}

/**
 * ClaudeCodeProvider constructs AgentQuery instances backed by the
 * @anthropic-ai/claude-agent-sdk query() function.
 *
 * All Claude-SDK-specific message parsing is encapsulated here.
 */
export class ClaudeCodeProvider implements AgentProvider, AgentRuntimeProvider {
  readonly kind = 'claude';
  readonly capabilities = {
    toolModes: ['mcp', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: true,
    supportsContextTransform: false,
    supportsHistoryProjection: true,
  } as const;

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
    if (typeof providerOptions.debug === 'boolean') {
      options.debug = providerOptions.debug;
    }
    if (typeof providerOptions.debugFile === 'string' && providerOptions.debugFile.length > 0) {
      options.debugFile = providerOptions.debugFile;
    }
    if (typeof providerOptions.stderr === 'function') {
      options.stderr = providerOptions.stderr;
    }
    if (typeof providerOptions.spawnClaudeCodeProcess === 'function') {
      options.spawnClaudeCodeProcess = providerOptions.spawnClaudeCodeProcess;
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

    const installedClaudePath = resolveUserInstalledCommand('claude', 'COZYBASE_CLAUDE_CODE_PATH');
    if (installedClaudePath) {
      options.pathToClaudeCodeExecutable = installedClaudePath;
    }

    const debugFilePath = resolveClaudeDebugFilePath();
    if (debugFilePath) {
      options.debugFile = debugFilePath;
    }

    const sdkQuery = query({ prompt: config.prompt, options });

    return new ClaudeCodeQuery(sdkQuery);
  }

  async createSession(spec: AgentSessionSpec): Promise<AgentRuntimeSession> {
    return new QueryBackedRuntimeSession(
      this.kind,
      this,
      (text, resumeSessionId) => ({
        prompt: text,
        systemPrompt: spec.systemPrompt,
        cwd: spec.cwd ?? process.cwd(),
        model: typeof spec.model === 'string' ? spec.model : undefined,
        resumeSessionId,
        providerOptions: spec.providerOptions ?? spec.mcpConfig,
      }),
    );
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
  private completedToolUseIds = new Set<string>();

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
    // ---- user: session resume replay and tool results ----
    if (msg.type === 'user') {
      const m = msg as any;
      const completions = this.extractToolCompletionsFromUserMessage(m);
      for (const completion of completions) {
        const event = this.buildToolCompletedEvent(completion.toolUseId, completion.summary);
        if (event) {
          yield event;
        }
      }
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

    // ---- auth_status: login/authentication progress ----
    if (msg.type === 'auth_status') {
      const m = msg as any;
      const output = Array.isArray(m.output) ? m.output.filter((line: unknown): line is string => typeof line === 'string') : [];
      const suffix = typeof m.error === 'string' && m.error.length > 0
        ? ` Error: ${m.error}`
        : '';
      const details = output.length > 0 ? ` ${output.join(' ')}` : '';
      yield {
        type: 'conversation.notice',
        message: `Claude authentication status:${details}${suffix}`.trim(),
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
      const precedingIds = Array.isArray(m.preceding_tool_use_ids)
        ? m.preceding_tool_use_ids.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
        : [];
      const ids: string[] = precedingIds.length > 0
        ? precedingIds
        : (typeof m.tool_use_id === 'string' && m.tool_use_id.length > 0)
            ? [m.tool_use_id]
            : [...this.toolUseMap.keys()];

      for (const toolUseId of ids) {
        const event = this.buildToolCompletedEvent(toolUseId, summary);
        if (event) {
          yield event;
        }
      }
      return;
    }

    // ---- result: run completed or error ----
    if (msg.type === 'result') {
      const m = msg as any;

      // Drain any tool calls that never received a tool_use_summary.
      // This guards against SDK versions that don't emit tool_use_summary.
      for (const [toolUseId, toolName] of this.toolUseMap) {
        if (this.completedToolUseIds.has(toolUseId)) continue;
        this.completedToolUseIds.add(toolUseId);
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

  private buildToolCompletedEvent(toolUseId: string, summary: string): AgentEvent | null {
    if (!toolUseId || this.completedToolUseIds.has(toolUseId)) {
      return null;
    }
    const toolName = this.toolUseMap.get(toolUseId) ?? 'tool';
    this.toolUseMap.delete(toolUseId);
    this.completedToolUseIds.add(toolUseId);
    return {
      type: 'conversation.tool.completed',
      toolUseId,
      toolName,
      summary,
    };
  }

  private extractToolCompletionsFromUserMessage(
    msg: any,
  ): Array<{ toolUseId: string; summary: string }> {
    const ids = new Set<string>();
    const addId = (value: unknown) => {
      if (typeof value === 'string' && value.length > 0) {
        ids.add(value);
      }
    };

    const toolUseResult = msg?.tool_use_result;
    addId(toolUseResult?.tool_use_id);
    addId(toolUseResult?.toolUseId);
    if (Array.isArray(toolUseResult?.preceding_tool_use_ids)) {
      for (const id of toolUseResult.preceding_tool_use_ids) {
        addId(id);
      }
    }

    const contentBlocks = Array.isArray(msg?.message?.content) ? msg.message.content : [];
    for (const block of contentBlocks) {
      if (block?.type === 'tool_result') {
        addId(block.tool_use_id);
        addId(block.toolUseId);
      }
    }

    if (ids.size === 0) {
      return [];
    }

    const summary =
      this.extractToolSummary(toolUseResult) ||
      this.extractToolSummaryFromContentBlocks(contentBlocks);

    return [...ids].map((toolUseId) => ({ toolUseId, summary }));
  }

  private extractToolSummary(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (!value || typeof value !== 'object') {
      return '';
    }
    const v = value as any;
    if (typeof v.summary === 'string') {
      return v.summary;
    }
    if (typeof v.result === 'string') {
      return v.result;
    }
    if (typeof v.text === 'string') {
      return v.text;
    }
    if (Array.isArray(v.content)) {
      return this.extractToolSummaryFromContentBlocks(v.content);
    }
    return '';
  }

  private extractToolSummaryFromContentBlocks(blocks: any[]): string {
    const parts: string[] = [];
    for (const block of blocks) {
      if (typeof block === 'string') {
        parts.push(block);
        continue;
      }
      if (!block || typeof block !== 'object') {
        continue;
      }
      if (typeof block.text === 'string') {
        parts.push(block.text);
        continue;
      }
      if (typeof block.content === 'string') {
        parts.push(block.content);
        continue;
      }
    }
    return parts.join('\n').trim();
  }
}
