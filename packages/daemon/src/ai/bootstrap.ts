import { existsSync, lstatSync, mkdirSync, symlinkSync } from 'fs';
import { join } from 'path';
import type { Hono } from 'hono';
import type { Config } from '../config';
import type { Workspace } from '../core/workspace';
import type { DraftRebuilder } from '../core/draft-rebuilder';
import type { Verifier } from '../core/verifier';
import type { Publisher } from '../core/publisher';
import type { UiBridge } from '../core/ui-bridge';
import type { EventBus } from '../core/event-bus';
import type { ScheduleManager } from '../core/schedule-manager';
import type { AppManager } from '../modules/apps/manager';
import {
  type AgentProvider,
  type AgentRuntimeProvider,
  AgentProviderRegistry,
  ClaudeCodeProvider,
  CodexProvider,
  PiAgentCoreProvider,
} from '@cozybase/ai-runtime';
import type { AppRegistry, PlatformClient } from '@cozybase/runtime';
import { LocalBackend } from './builder/local-backend';
import { createCozybaseSdkMcpServer } from './builder/mcp-server';
import { ChatSessionManager } from './builder/session-manager';
import type { ChatSessionRuntimeConfig } from './builder/session';
import { SessionStore } from './builder/session-store';
import { RuntimeSessionStore } from './runtime-session-store';
import { OperatorSessionManager } from './operator/session-manager';
import { resolveOperatorRuntime } from './operator/runtime-config';
import { initWorkspace } from '../workspace-init';
import {
  resolveEffectiveAgentConfig,
  type AgentProviderKind,
} from '../modules/settings/agent-config';
import { resolveDaemonEntryPath } from '../runtime-paths';
import { startInProcessMcpHttpBridge, type InProcessMcpHttpBridge } from '../mcp/http-bridge';

type CodexMcpMode = 'http' | 'stdio';

type ProviderOptionsFactory = (ctx: {
  appSlug: string;
  agentDir: string;
  mode: 'chat' | 'extract';
}) => unknown;

type BuilderRuntimeProvider = AgentRuntimeProvider & AgentProvider;

export interface BootstrapAiDeps {
  config: Config;
  workspace: Workspace;
  app: Hono;
  registry: AppRegistry;
  stablePlatformClient: PlatformClient;
  appManager: AppManager;
  draftRebuilder: DraftRebuilder;
  verifier: Verifier;
  publisher: Publisher;
  scheduleManager: ScheduleManager;
  uiBridge: UiBridge;
  eventBus?: EventBus;
  runtimeStartup: Promise<void>;
}

export interface BootstrapAiResult {
  agentDir: string;
  chatSessionManager: ChatSessionManager;
  operatorSessionManager: OperatorSessionManager;
  resolveBuilderRuntime: () => BuilderRuntimeConfig;
  startup: Promise<void>;
  shutdown: () => Promise<void>;
}

export interface BuilderRuntimeConfig extends ChatSessionRuntimeConfig {
  agentProvider: BuilderRuntimeProvider;
}

export function bootstrapAi(deps: BootstrapAiDeps): BootstrapAiResult {
  const agentDir = join(deps.config.workspaceDir, 'agent');
  mkdirSync(join(agentDir, 'apps'), { recursive: true });

  initWorkspace(agentDir);
  const claudeDocPath = join(agentDir, 'CLAUDE.md');
  if (!pathExists(claudeDocPath)) {
    symlinkSync('AGENTS.md', claudeDocPath);
  }
  const agentsSkillsRoot = join(agentDir, '.agents');
  const claudeSkillsRoot = join(agentDir, '.claude');
  if (pathExists(agentsSkillsRoot) && !pathExists(claudeSkillsRoot)) {
    symlinkSync('.agents', claudeSkillsRoot);
  }

  const localBackend = new LocalBackend({
    workspace: deps.workspace,
    appManager: deps.appManager,
    draftRebuilder: deps.draftRebuilder,
    verifier: deps.verifier,
    publisher: deps.publisher,
    registry: deps.registry,
    scheduleManager: deps.scheduleManager,
    uiBridge: deps.uiBridge,
    honoApp: deps.app,
    eventBus: deps.eventBus,
  });

  const sdkMcpServer = createCozybaseSdkMcpServer({
    backend: localBackend,
    appsDir: join(agentDir, 'apps'),
  });

  const providerRegistry = new AgentProviderRegistry();
  providerRegistry.register(new ClaudeCodeProvider());
  providerRegistry.register(new CodexProvider());
  providerRegistry.register(new PiAgentCoreProvider());

  const codexMcpMode = resolveCodexMcpMode(process.env.COZYBASE_CODEX_MCP_MODE);
  const codexApprovalPolicy = process.env.COZYBASE_CODEX_APPROVAL_POLICY ?? 'never';
  const codexSandboxMode = process.env.COZYBASE_CODEX_SANDBOX_MODE ?? 'workspace-write';
  const initialBuilderConfig = resolveBuilderConfig(deps.workspace);

  let codexHttpBridge: InProcessMcpHttpBridge | null = null;
  let codexHttpBridgeFailed =
    initialBuilderConfig.provider === 'codex' && codexMcpMode === 'http';

  const codexBridgeStartup =
    initialBuilderConfig.provider === 'codex' && codexMcpMode === 'http'
      ? startInProcessMcpHttpBridge({
          backend: localBackend,
          appsDir: join(agentDir, 'apps'),
        })
          .then((bridge) => {
            codexHttpBridge = bridge;
            codexHttpBridgeFailed = false;
            console.log(`Codex MCP bridge ready at ${bridge.url}`);
          })
          .catch((err) => {
            codexHttpBridgeFailed = true;
            console.error(
              'Failed to start in-process MCP HTTP bridge. Falling back to stdio MCP for Codex:',
              err,
            );
          })
      : Promise.resolve();

  const buildProviderOptionsFactory =
    (providerKind: AgentProviderKind): ProviderOptionsFactory =>
    ({ mode }) => {
      if (providerKind === 'claude') {
        if (mode === 'extract') {
          return {
            tools: [],
            allowedTools: [],
            permissionMode: 'acceptEdits',
            settingSources: ['project'],
          };
        }

        return {
          tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
          allowedTools: [
            'Read',
            'Edit',
            'Write',
            'Bash',
            'Glob',
            'Grep',
            'mcp__cozybase__*',
          ],
          mcpServers: { cozybase: sdkMcpServer },
          permissionMode: 'acceptEdits',
          settingSources: ['project'],
        };
      }

      const baseCodexConfig: Record<string, unknown> = {
        approval_policy: codexApprovalPolicy,
        sandbox_mode: mode === 'extract' ? 'read-only' : codexSandboxMode,
      };

      if (mode === 'extract') {
        return { codexConfig: { ...baseCodexConfig, mcp_servers: {} } };
      }

      const mcpServerConfig = buildCodexMcpServerConfig({
        codexMcpMode,
        bridge: codexHttpBridge,
        bridgeFailed: codexHttpBridgeFailed,
        workspaceDir: deps.config.workspaceDir,
        agentDir,
      });

      return {
        codexConfig: {
          ...baseCodexConfig,
          mcp_servers: {
            cozybase: mcpServerConfig,
          },
        },
      };
    };

  const resolveBuilderRuntime = (): BuilderRuntimeConfig => {
    const agentConfig = resolveBuilderConfig(deps.workspace);
    return {
      agentProvider: requireBuilderProvider(providerRegistry, agentConfig.provider),
      providerKind: agentConfig.provider,
      model: agentConfig.model,
      providerOptionsFactory: buildProviderOptionsFactory(agentConfig.provider),
    };
  };

  const sessionStore = new SessionStore(deps.workspace.getPlatformDb());
  const runtimeSessionStore = new RuntimeSessionStore(deps.workspace.getPlatformDb());

  const chatSessionManager = new ChatSessionManager(
    {
      ...resolveBuilderRuntime(),
      agentDir,
      runtimeResolver: resolveBuilderRuntime,
    },
    sessionStore,
    runtimeSessionStore,
    deps.eventBus,
  );

  const operatorSessionManager = new OperatorSessionManager({
    workspace: deps.workspace,
    workspaceDir: deps.config.workspaceDir,
    agentDir,
    registry: deps.registry,
    stablePlatformClient: deps.stablePlatformClient,
    runtimeStore: runtimeSessionStore,
    runtimeResolver: () => resolveOperatorRuntime(deps.workspace, providerRegistry),
  });

  return {
    agentDir,
    chatSessionManager,
    operatorSessionManager,
    resolveBuilderRuntime,
    startup: Promise.all([deps.runtimeStartup, codexBridgeStartup]).then(() => undefined),
    shutdown: async () => {
      deps.scheduleManager.shutdown();
      if (codexHttpBridge) {
        await codexHttpBridge.close().catch((err) => {
          console.error('Failed to close Codex MCP bridge:', err);
        });
      }
      for (const provider of providerRegistry.list()) {
        provider.dispose();
      }
    },
  };
}

function requireBuilderProvider(
  providerRegistry: AgentProviderRegistry,
  providerKind: AgentProviderKind,
): BuilderRuntimeProvider {
  const provider = providerRegistry.require(providerKind);
  if (!('createQuery' in provider) || typeof provider.createQuery !== 'function') {
    throw new Error(`Agent provider '${providerKind}' does not support Builder sessions`);
  }
  return provider as BuilderRuntimeProvider;
}

function resolveBuilderConfig(workspace: Workspace) {
  return resolveEffectiveAgentConfig({
    storedProvider: workspace.getPlatformRepo().settings.get('agent.provider'),
    storedModel: workspace.getPlatformRepo().settings.get('agent.model'),
    envProvider: process.env.COZYBASE_AGENT_PROVIDER,
    envModel: process.env.COZYBASE_AGENT_MODEL,
  });
}

function pathExists(path: string): boolean {
  if (existsSync(path)) {
    return true;
  }
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function resolveCodexMcpMode(value: string | undefined): CodexMcpMode {
  return value?.toLowerCase() === 'stdio' ? 'stdio' : 'http';
}

function buildCodexMcpServerConfig(params: {
  codexMcpMode: CodexMcpMode;
  bridge: InProcessMcpHttpBridge | null;
  bridgeFailed: boolean;
  workspaceDir: string;
  agentDir: string;
}) {
  const cliPath = resolveDaemonEntryPath();
  const stdioConfig = {
    type: 'stdio',
    command: 'bun',
    args: [
      cliPath,
      'mcp',
      '--workspace',
      params.workspaceDir,
      '--apps-dir',
      join(params.agentDir, 'apps'),
    ],
  };

  if (params.codexMcpMode === 'stdio') {
    return stdioConfig;
  }

  if (params.bridge && !params.bridgeFailed) {
    return {
      type: 'streamable_http',
      url: params.bridge.url,
      http_headers: {
        Authorization: `Bearer ${params.bridge.bearerToken}`,
      },
    };
  }

  return stdioConfig;
}
