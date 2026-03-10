import type { AgentEvent, AgentSessionSpec, AgentToolMode } from '@cozybase/ai-runtime';
import {
  buildOperatorSystemPrompt,
  createOperatorTools,
  type AppContext,
  type CallApiFn,
} from '@cozybase/operator-agent';
import { RuntimeAgentSession } from '../runtime-agent-session';
import type { RuntimeSessionStore } from '../runtime-session-store';
import { createOperatorMcpServer } from './mcp-server';
import type { OperatorRuntimeConfig } from './runtime-config';
import { createOperatorSdkMcpServer } from './sdk-mcp-server';
import {
  startInProcessMcpHttpBridgeWithFactory,
  type InProcessMcpHttpBridge,
} from '../../mcp/http-bridge';
import { resolveBunExecutable, resolveDaemonEntryPath } from '../../runtime-paths';
import type { EventBus } from '../../core/event-bus';

interface WebSocketLike {
  send(data: string): void;
  readyState: number;
}

export interface OperatorSessionConfig {
  appSlug: string;
  displayName: string;
  description: string;
  loadAppContext: () => Promise<AppContext>;
  callApi: CallApiFn;
  cwd?: string;
  workspaceDir: string;
  runtimeResolver: () => OperatorRuntimeConfig;
  runtimeStore: RuntimeSessionStore;
  maxMessages?: number;
  eventBus?: EventBus;
}

export class OperatorSession extends RuntimeAgentSession<OperatorRuntimeConfig> {
  private appContext: AppContext | null = null;
  private appContextPromise: Promise<AppContext> | null = null;
  private mcpBridge: InProcessMcpHttpBridge | null = null;
  private readonly toolsDisabled =
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === '1' ||
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === 'true';
  private readonly eventBus?: EventBus;
  private lastAssistantMessage: string | null = null;

  constructor(private readonly config: OperatorSessionConfig) {
    super(config.appSlug, config.runtimeStore, config.runtimeResolver);
    this.eventBus = config.eventBus;
  }

  connect(ws: WebSocketLike): void {
    super.connect(ws);
  }

  protected getUsageType() {
    return 'operator' as const;
  }

  protected async buildSessionSpec(runtime: OperatorRuntimeConfig): Promise<AgentSessionSpec> {
    const appContext = await this.ensureAppContext();
    const toolMode = this.resolveToolMode(runtime);
    this.ensureSupportedToolMode(runtime, toolMode);

    const sessionSpec: AgentSessionSpec = {
      systemPrompt: buildOperatorSystemPrompt(appContext),
      model: runtime.model,
      cwd: this.config.cwd,
      toolMode,
      contextPolicy: {
        maxMessages: this.config.maxMessages ?? 50,
      },
    };

    if (toolMode === 'native') {
      sessionSpec.nativeTools = createOperatorTools(this.config.callApi);
      sessionSpec.providerOptions = runtime.getApiKey
        ? { getApiKey: runtime.getApiKey }
        : undefined;
    } else if (toolMode === 'mcp') {
      const providerOptions = await this.buildMcpProviderOptions(runtime);
      sessionSpec.mcpConfig = providerOptions;
      sessionSpec.providerOptions = providerOptions;
    }

    return sessionSpec;
  }

  protected afterPrompt(): void {
    if (this.delegatedTaskId && this.eventBus) {
      if (this.lastPromptError) {
        this.eventBus.emit('task:failed', {
          taskId: this.delegatedTaskId,
          appSlug: this.appSlug,
          error: this.lastPromptError,
        });
      } else {
        this.eventBus.emit('task:completed', {
          taskId: this.delegatedTaskId,
          appSlug: this.appSlug,
          summary: this.lastAssistantMessage?.trim() || `Operator task for '${this.appSlug}' completed.`,
        });
      }
      this.delegatedTaskId = null;
    }
    this.runEventBuffer = [];
    this.lastAssistantMessage = null;
  }

  protected onShutdown(): void {
    this.appContextPromise = null;
    this.appContext = null;
    this.lastAssistantMessage = null;
    if (this.mcpBridge) {
      void this.mcpBridge.close().catch((err) => {
        console.error(`[operator] Failed to close MCP bridge for '${this.appSlug}':`, err);
      });
      this.mcpBridge = null;
    }
  }

  private resolveToolMode(runtime: OperatorRuntimeConfig): AgentToolMode {
    if (this.toolsDisabled) {
      return 'none';
    }
    return runtime.toolMode;
  }

  private ensureSupportedToolMode(runtime: OperatorRuntimeConfig, toolMode: AgentToolMode): void {
    if (!runtime.agentProvider.capabilities.toolModes.includes(toolMode)) {
      throw new Error(
        `Operator runtime provider '${runtime.providerKind}' does not support tool mode '${toolMode}'`,
      );
    }
  }

  private async buildMcpProviderOptions(runtime: OperatorRuntimeConfig): Promise<unknown> {
    if (runtime.providerKind === 'codex') {
      const mcpServerConfig = await this.buildCodexOperatorMcpServerConfig();
      return {
        codexConfig: {
          approval_policy: process.env.COZYBASE_CODEX_APPROVAL_POLICY ?? 'never',
          sandbox_mode: process.env.COZYBASE_CODEX_SANDBOX_MODE ?? 'workspace-write',
          mcp_servers: {
            operator: mcpServerConfig,
          },
        },
      };
    }

    if (runtime.providerKind === 'claude-code') {
      return {
        mcpServers: {
          operator: createOperatorSdkMcpServer(this.config.callApi),
        },
        tools: [],
        allowedTools: ['mcp__operator__*'],
        permissionMode: 'acceptEdits',
        settingSources: ['project'],
      };
    }

    throw new Error(`Operator MCP tools are not supported for provider '${runtime.providerKind}'`);
  }

  private async buildCodexOperatorMcpServerConfig(): Promise<Record<string, unknown>> {
    const mode = resolveOperatorCodexMcpMode(process.env.COZYBASE_OPERATOR_CODEX_MCP_MODE);
    if (mode === 'http') {
      try {
        const bridge = await this.ensureMcpBridge();
        return {
          type: 'streamable_http',
          url: bridge.url,
          http_headers: {
            Authorization: `Bearer ${bridge.bearerToken}`,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `[operator] Failed to start Operator MCP HTTP bridge for '${this.appSlug}'. Falling back to stdio MCP. ${message}`,
        );
      }
    }

    const cliPath = resolveDaemonEntryPath();
    const command = resolveBunExecutable();
    return {
      type: 'stdio',
      command,
      args: [
        cliPath,
        'operator-mcp',
        '--workspace',
        this.config.workspaceDir,
        '--app',
        this.appSlug,
      ],
    };
  }

  private async ensureMcpBridge(): Promise<InProcessMcpHttpBridge> {
    if (this.mcpBridge) {
      return this.mcpBridge;
    }

    this.mcpBridge = await startInProcessMcpHttpBridgeWithFactory({
      basePath: `/internal/operator/${encodeURIComponent(this.appSlug)}/mcp`,
      createServer: () => createOperatorMcpServer(this.config.callApi),
    });
    return this.mcpBridge;
  }

  private async ensureAppContext(): Promise<AppContext> {
    if (this.appContext) {
      return this.appContext;
    }

    if (this.appContextPromise) {
      return this.appContextPromise;
    }

    const pending = this.config.loadAppContext().then((appContext) => {
      this.appContext = appContext;
      return appContext;
    });
    this.appContextPromise = pending;

    try {
      return await pending;
    } finally {
      if (this.appContextPromise === pending) {
        this.appContextPromise = null;
      }
    }
  }

  protected onRuntimeEvent(event: AgentEvent): void {
    if (event.type === 'conversation.message.completed' && event.role === 'assistant' && event.content) {
      this.lastAssistantMessage = event.content;
    }
  }
}

function resolveOperatorCodexMcpMode(value: string | undefined): 'http' | 'stdio' {
  return value?.toLowerCase() === 'http' ? 'http' : 'stdio';
}
