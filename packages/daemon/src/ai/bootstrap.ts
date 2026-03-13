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
import { CozyBaseSessionManager } from './cozybase/session-manager';
import { buildClaudeSdkLoggingOptions } from './claude-sdk-logging';
import { initWorkspace } from '../workspace-init';
import {
  resolveEffectiveAgentConfig,
  type AgentProviderKind,
} from '../modules/settings/agent-config';
import { buildBuilderCodexMcpServerConfig } from './codex-mcp-config';

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
  eventBus: EventBus;
  runtimeStartup: Promise<void>;
}

export interface BootstrapAiResult {
  agentDir: string;
  chatSessionManager: ChatSessionManager;
  operatorSessionManager: OperatorSessionManager;
  cozybaseSessionManager: CozyBaseSessionManager;
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

  const codexApprovalPolicy = process.env.COZYBASE_CODEX_APPROVAL_POLICY ?? 'never';
  const codexSandboxMode = process.env.COZYBASE_CODEX_SANDBOX_MODE ?? 'workspace-write';

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
            ...buildClaudeSdkLoggingOptions('builder-extract'),
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
          ...buildClaudeSdkLoggingOptions('builder-chat'),
        };
      }

      const baseCodexConfig: Record<string, unknown> = {
        approval_policy: codexApprovalPolicy,
        sandbox_mode: mode === 'extract' ? 'read-only' : codexSandboxMode,
        skip_git_repo_check: true,
      };

      if (mode === 'extract') {
        return { codexConfig: { ...baseCodexConfig, mcp_servers: {} } };
      }

      const mcpServerConfig = buildBuilderCodexMcpServerConfig({
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
    eventBus: deps.eventBus,
  });

  const cozybaseSessionManager = new CozyBaseSessionManager({
    workspace: deps.workspace,
    registry: deps.registry,
    appManager: deps.appManager,
    chatSessionManager,
    operatorSessionManager,
    runtimeStore: runtimeSessionStore,
    providerRegistry,
    eventBus: deps.eventBus,
    agentDir,
    resolveBuilderRuntime,
  });

  return {
    agentDir,
    chatSessionManager,
    operatorSessionManager,
    cozybaseSessionManager,
    resolveBuilderRuntime,
    startup: deps.runtimeStartup.then(() => undefined),
    shutdown: async () => {
      deps.scheduleManager.shutdown();
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
