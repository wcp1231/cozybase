/**
 * CodexProvider — wraps @openai/codex-sdk and converts SDK-specific events
 * into normalized AgentEvent streams.
 */

import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import {
  Codex,
  type ThreadEvent,
  type ThreadOptions,
  type RunResult,
  type TurnOptions,
} from '@openai/codex-sdk';
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

type JsonObject = Record<string, unknown>;

type StreamedTurnLike = {
  events: AsyncIterable<ThreadEvent>;
};

interface CodexLike {
  startThread(options?: ThreadOptions): ThreadLike;
  resumeThread(threadId: string, options?: ThreadOptions): ThreadLike;
}

interface ThreadLike {
  id: string | null;
  run(input: string, options?: TurnOptions): Promise<RunResult>;
  runStreamed?(input: string, options?: TurnOptions): Promise<StreamedTurnLike>;
  interrupt?(): Promise<void>;
  cancel?(): Promise<void>;
  abort?(): void;
}

/** Shape of CodexProvider-specific options passed via AgentQueryConfig.providerOptions */
export interface CodexProviderOptions {
  /** Passed through to Codex config, e.g. mcp_servers/approval_policy/sandbox_mode */
  codexConfig?: JsonObject;
}

export class CodexProvider implements AgentProvider, AgentRuntimeProvider {
  readonly kind = 'codex';
  readonly capabilities = {
    toolModes: ['mcp', 'none'],
    supportsResume: true,
    supportsWorkingDirectory: true,
    supportsContextTransform: false,
    supportsHistoryProjection: true,
  } as const;

  createQuery(config: AgentQueryConfig): AgentQuery {
    const providerOptions = (config.providerOptions ?? {}) as CodexProviderOptions;
    return new CodexQuery(config, providerOptions);
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
    // Codex can run with either env key or persisted CLI auth.
    if (process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) {
      return true;
    }

    const codexHome = process.env.CODEX_HOME ?? join(homedir(), '.codex');
    return existsSync(join(codexHome, 'auth.json'));
  }

  dispose(): void {
    // No shared resources to release for this provider.
  }
}

class CodexQuery implements AgentQuery {
  private config: AgentQueryConfig;
  private providerOptions: CodexProviderOptions;
  private interrupted = false;
  private messageCounter = 0;
  private toolCounter = 0;
  private threadId: string | null;
  private abortController = new AbortController();
  private activeThread: ThreadLike | null = null;
  private activeStreamIterator: AsyncIterator<ThreadEvent> | null = null;

  private messageStates = new Map<string, { messageId: string; lastText: string }>();
  private toolStates = new Map<string, { toolUseId: string; toolName: string }>();

  constructor(config: AgentQueryConfig, providerOptions: CodexProviderOptions) {
    this.config = config;
    this.providerOptions = providerOptions;
    this.threadId = config.resumeSessionId ?? null;
  }

  async interrupt(): Promise<void> {
    this.interrupted = true;
    this.abortController.abort();
    await this.tryInterruptThread();

    const iterator = this.activeStreamIterator;
    if (iterator && typeof iterator.return === 'function') {
      await iterator.return();
    }
  }

  close(): void {
    this.interrupted = true;
    this.abortController.abort();
    const thread = this.activeThread;
    if (thread) {
      if (typeof thread.abort === 'function') {
        try {
          thread.abort();
        } catch {
          // Best effort.
        }
      } else if (typeof thread.cancel === 'function') {
        void thread.cancel().catch(() => {});
      } else if (typeof thread.interrupt === 'function') {
        void thread.interrupt().catch(() => {});
      }
    }
    const iterator = this.activeStreamIterator;
    if (iterator && typeof iterator.return === 'function') {
      void iterator.return();
    }
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<AgentEvent> {
    yield { type: 'conversation.run.started' };

    try {
      const codexConfig = this.buildCodexConfig();
      const codex = this.loadCodex(codexConfig);
      const threadOptions = this.buildThreadOptions(codexConfig);

      const thread = this.config.resumeSessionId
        ? codex.resumeThread(this.config.resumeSessionId, threadOptions)
        : codex.startThread(threadOptions);
      this.activeThread = thread;
      this.threadId = thread.id ?? this.threadId;

      if (this.interrupted) {
        await this.tryInterruptThread();
        yield { type: 'conversation.run.completed', sessionId: this.threadId ?? '' };
        return;
      }

      const input = this.composeInput();

      if (typeof thread.runStreamed === 'function') {
        const streamed = await thread.runStreamed(input, {
          signal: this.abortController.signal,
        });
        const iterator = streamed.events[Symbol.asyncIterator]();
        this.activeStreamIterator = iterator;
        try {
          while (!this.interrupted) {
            const step = await iterator.next();
            if (step.done) {
              break;
            }
            for (const event of this.mapThreadEvent(step.value)) {
              yield event;
            }
          }
        } finally {
          this.activeStreamIterator = null;
        }

        if (!this.interrupted) {
          yield {
            type: 'conversation.run.completed',
            sessionId: this.threadId ?? this.config.resumeSessionId ?? '',
          };
        }
      } else {
        const result = await thread.run(input, {
          signal: this.abortController.signal,
        });

        const items = Array.isArray(result?.items) ? result.items : [];
        for (const item of items) {
          for (const event of this.mapItemLifecycle('completed', item)) {
            yield event;
          }
        }

        if (!this.interrupted) {
          yield {
            type: 'conversation.run.completed',
            sessionId: this.threadId ?? this.config.resumeSessionId ?? '',
          };
        }
      }
    } catch (err) {
      if (this.interrupted) {
        yield {
          type: 'conversation.run.completed',
          sessionId: this.threadId ?? this.config.resumeSessionId ?? '',
        };
        return;
      }
      yield {
        type: 'conversation.error',
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      this.activeThread = null;
      this.activeStreamIterator = null;
      this.messageStates.clear();
      this.toolStates.clear();
    }
  }

  private loadCodex(codexConfig: JsonObject): CodexLike {
    return new Codex({ config: codexConfig as any }) as unknown as CodexLike;
  }

  private buildCodexConfig(): JsonObject {
    const cfg: JsonObject = { ...(this.providerOptions.codexConfig ?? {}) };
    if (this.config.model && cfg.model === undefined) {
      cfg.model = this.config.model;
    }
    return cfg;
  }

  private buildThreadOptions(codexConfig: JsonObject): ThreadOptions {
    const options: ThreadOptions = {
      workingDirectory: this.config.cwd,
    };

    if (typeof codexConfig.model === 'string') {
      options.model = codexConfig.model;
    }
    if (typeof codexConfig.sandbox_mode === 'string') {
      options.sandboxMode = codexConfig.sandbox_mode as ThreadOptions['sandboxMode'];
    }
    if (typeof codexConfig.approval_policy === 'string') {
      options.approvalPolicy = codexConfig.approval_policy as ThreadOptions['approvalPolicy'];
    }
    if (typeof codexConfig.skip_git_repo_check === 'boolean') {
      options.skipGitRepoCheck = codexConfig.skip_git_repo_check;
    } else if (typeof codexConfig.skipGitRepoCheck === 'boolean') {
      options.skipGitRepoCheck = codexConfig.skipGitRepoCheck;
    }

    return options;
  }

  private composeInput(): string {
    if (this.config.systemPrompt?.trim()) {
      return `${this.config.systemPrompt.trim()}\n\nUser request:\n${this.config.prompt}`;
    }
    return this.config.prompt;
  }

  private async tryInterruptThread(): Promise<void> {
    const thread = this.activeThread;
    if (!thread) return;

    if (typeof thread.interrupt === 'function') {
      await thread.interrupt().catch(() => {});
      return;
    }
    if (typeof thread.cancel === 'function') {
      await thread.cancel().catch(() => {});
      return;
    }
    if (typeof thread.abort === 'function') {
      try {
        thread.abort();
      } catch {
        // Best effort.
      }
    }
  }

  private mapThreadEvent(event: ThreadEvent): AgentEvent[] {
    if (event.type === 'thread.started') {
      this.threadId = event.thread_id;
      return [];
    }

    if (event.type === 'turn.failed') {
      return [{
        type: 'conversation.error',
        message: event.error?.message ?? 'Codex turn failed',
      }];
    }

    if (event.type === 'error') {
      return [{
        type: 'conversation.error',
        message: event.message,
      }];
    }

    if (event.type === 'item.started') {
      return this.mapItemLifecycle('started', event.item);
    }

    if (event.type === 'item.updated') {
      return this.mapItemLifecycle('updated', event.item);
    }

    if (event.type === 'item.completed') {
      return this.mapItemLifecycle('completed', event.item);
    }

    return [];
  }

  private mapItemLifecycle(phase: 'started' | 'updated' | 'completed', item: unknown): AgentEvent[] {
    const i = item as any;
    if (!i || typeof i !== 'object') return [];

    if (i.type === 'agent_message') {
      return this.mapAgentMessageLifecycle(phase, i);
    }

    if (i.type === 'command_execution' || i.type === 'mcp_tool_call') {
      return this.mapToolLifecycle(phase, i);
    }

    return [];
  }

  private mapAgentMessageLifecycle(
    phase: 'started' | 'updated' | 'completed',
    item: { id?: string; text?: string },
  ): AgentEvent[] {
    const itemId = typeof item.id === 'string' && item.id.length > 0
      ? item.id
      : `agent-message-${this.messageCounter + 1}`;
    const text = typeof item.text === 'string' ? item.text : '';

    let state = this.messageStates.get(itemId);
    const events: AgentEvent[] = [];
    if (!state) {
      state = {
        messageId: `msg-${++this.messageCounter}`,
        lastText: '',
      };
      this.messageStates.set(itemId, state);
      events.push({
        type: 'conversation.message.started',
        messageId: state.messageId,
        role: 'assistant',
      });
    }

    if (phase === 'updated') {
      const delta = this.computeDelta(state.lastText, text);
      if (delta.length > 0) {
        events.push({
          type: 'conversation.message.delta',
          messageId: state.messageId,
          role: 'assistant',
          delta,
        });
      }
      state.lastText = text;
    }

    if (phase === 'completed') {
      state.lastText = text;
      events.push({
        type: 'conversation.message.completed',
        messageId: state.messageId,
        role: 'assistant',
        content: text,
      });
      this.messageStates.delete(itemId);
    }

    return events;
  }

  private mapToolLifecycle(
    phase: 'started' | 'updated' | 'completed',
    item: any,
  ): AgentEvent[] {
    const itemId = typeof item.id === 'string' && item.id.length > 0
      ? item.id
      : `tool-item-${this.toolCounter + 1}`;

    const toolName = item.type === 'mcp_tool_call'
      ? `${String(item.server ?? 'mcp')}.${String(item.tool ?? 'tool')}`
      : 'Bash';

    let state = this.toolStates.get(itemId);
    const events: AgentEvent[] = [];
    if (!state) {
      state = {
        toolUseId: `tool-${++this.toolCounter}`,
        toolName,
      };
      this.toolStates.set(itemId, state);
      const startedEvent: AgentEvent = {
        type: 'conversation.tool.started',
        toolUseId: state.toolUseId,
        toolName: state.toolName,
      };
      const input = this.extractToolInput(item);
      if (input) {
        startedEvent.input = input;
      }
      events.push(startedEvent);
    }

    if (phase === 'completed' || this.isTerminalToolStatus(item.status)) {
      events.push({
        type: 'conversation.tool.completed',
        toolUseId: state.toolUseId,
        toolName: state.toolName,
        summary: this.buildToolSummary(item),
      });
      this.toolStates.delete(itemId);
    }

    return events;
  }

  private isTerminalToolStatus(status: unknown): boolean {
    return status === 'completed' || status === 'failed';
  }

  private buildToolSummary(item: any): string {
    if (item?.type === 'command_execution') {
      const status = typeof item.status === 'string' ? item.status : 'completed';
      const command = typeof item.command === 'string' ? item.command : '';
      if (command) {
        return `${status}: ${command}`;
      }
      return status;
    }

    if (item?.type === 'mcp_tool_call') {
      const status = typeof item.status === 'string' ? item.status : 'completed';
      const server = String(item.server ?? 'mcp');
      const tool = String(item.tool ?? 'tool');
      if (status === 'failed') {
        return `failed: ${item.error?.message ?? `${server}.${tool} failed`}`;
      }
      return `${status}: ${server}.${tool}`;
    }

    return 'completed';
  }

  private extractToolInput(item: any): Record<string, unknown> | undefined {
    const candidate = item?.input ?? item?.arguments ?? item?.params;
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }

    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        return { raw: candidate };
      }
      return { raw: candidate };
    }

    return undefined;
  }

  private computeDelta(previous: string, next: string): string {
    if (next === previous) {
      return '';
    }
    if (next.startsWith(previous)) {
      return next.slice(previous.length);
    }
    return next;
  }
}
