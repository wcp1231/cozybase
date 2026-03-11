import { extractAppInfo, deduplicateSlug } from '@cozybase/builder-agent';
import type {
  AgentProviderRegistry,
} from '@cozybase/ai-runtime';
import { getCozyBaseActions } from '@cozybase/cozybase-agent';
import type {
  AppDetail,
  AppLifecycleResult,
  AppPageSummary,
  AppSummary,
  AppSummaryStatus,
  CozyBaseActionContext,
  DelegatedToolResult,
  DeleteAppResult,
} from '@cozybase/cozybase-agent';
import type { AppRegistry } from '@cozybase/runtime';
import type { Workspace } from '../../core/workspace';
import type { EventBus } from '../../core/event-bus';
import type { AppManager } from '../../modules/apps/manager';
import type { RuntimeSessionStore } from '../runtime-session-store';
import type { ChatSessionManager } from '../builder/session-manager';
import type { OperatorSessionManager } from '../operator/session-manager';
import type { BuilderRuntimeConfig } from '../bootstrap';
import { resolveCozyBaseRuntime } from './config';
import { createCozyBaseSdkMcpServer } from './mcp-server';
import { CozyBaseSession } from './session';
import { TaskRegistry, type EnqueueTaskInput } from './task-registry';
import { buildCozyBaseCodexMcpServerConfig } from '../codex-mcp-config';

export interface CozyBaseSessionManagerConfig {
  workspace: Workspace;
  registry: AppRegistry;
  appManager: AppManager;
  chatSessionManager: ChatSessionManager;
  operatorSessionManager: OperatorSessionManager;
  runtimeStore: RuntimeSessionStore;
  providerRegistry: AgentProviderRegistry;
  eventBus: EventBus;
  agentDir: string;
  resolveBuilderRuntime: () => BuilderRuntimeConfig;
}

export class CozyBaseSessionManager {
  private session: CozyBaseSession | null = null;
  private readonly taskRegistry: TaskRegistry;
  private readonly actionContext: CozyBaseActionContext;
  private readonly actionsByName = new Map(getCozyBaseActions().map((action) => [action.name, action]));

  constructor(private readonly config: CozyBaseSessionManagerConfig) {
    this.taskRegistry = new TaskRegistry(this.config.eventBus, {
      builder: async (task) => {
        const session = this.config.chatSessionManager.getOrCreate(task.appSlug);
        try {
          session.delegatedTaskId = task.taskId;
          await session.injectPrompt(task.instruction);
        } catch (error) {
          session.delegatedTaskId = null;
          throw error;
        }
      },
      operator: async (task) => {
        const session = this.config.operatorSessionManager.getOrCreate(task.appSlug);
        try {
          session.delegatedTaskId = task.taskId;
          await session.injectPrompt(task.instruction);
        } catch (error) {
          session.delegatedTaskId = null;
          throw error;
        }
      },
    });
    this.actionContext = {
      listApps: async () => this.listApps(),
      getAppDetail: async (appName) => this.getAppDetail(appName),
      startApp: async (appName) => this.startApp(appName),
      stopApp: async (appName) => this.stopApp(appName),
      deleteApp: async (appName) => this.deleteApp(appName),
      createApp: async (idea) => this.createApp(idea),
      developApp: async (appName, instruction) => this.developApp(appName, instruction),
      operateApp: async (appName, instruction) => this.operateApp(appName, instruction),
    };
  }

  getOrCreate(): CozyBaseSession {
    if (this.session) {
      return this.session;
    }

    this.session = new CozyBaseSession({
      runtimeStore: this.config.runtimeStore,
      runtimeResolver: () => resolveCozyBaseRuntime(this.config.workspace, this.config.providerRegistry),
      providerOptionsResolver: async (providerKind) => {
        if (providerKind === 'claude-code') {
          return {
            mcpServers: {
              cozybase: createCozyBaseSdkMcpServer(this.actionContext),
            },
            tools: [],
            allowedTools: ['mcp__cozybase__*'],
            permissionMode: 'acceptEdits',
            settingSources: ['project'],
          };
        }

        return {
          codexConfig: {
            approval_policy: process.env.COZYBASE_CODEX_APPROVAL_POLICY ?? 'never',
            sandbox_mode: process.env.COZYBASE_CODEX_SANDBOX_MODE ?? 'workspace-write',
            mcp_servers: {
              cozybase: buildCozyBaseCodexMcpServerConfig({
                workspaceDir: this.config.workspace.root,
              }),
            },
          },
        };
      },
      eventBus: this.config.eventBus,
      cwd: this.config.agentDir,
      getTask: (taskId) => this.taskRegistry.getTask(taskId),
    });
    return this.session;
  }

  shutdown(): void {
    this.session?.shutdown();
    this.session = null;
    this.taskRegistry.shutdown();
  }

  async executeAction(actionName: string, input: unknown): Promise<unknown> {
    const action = this.actionsByName.get(actionName);
    if (!action) {
      throw new Error(`Unknown CozyBase action '${actionName}'`);
    }

    return action.execute(this.actionContext, input as never);
  }

  private listApps(): AppSummary[] {
    return this.config.appManager.list().map((app) => ({
      slug: app.slug,
      displayName: app.displayName,
      status: toAppSummaryStatus(app.stableStatus),
    }));
  }

  private getAppDetail(appName: string): AppDetail {
    const slug = normalizeAppName(appName);
    const app = this.config.appManager.getAppWithFiles(slug);
    const functionMode = app.published_version > 0 ? 'stable' : 'draft';
    return {
      slug: app.slug,
      displayName: app.displayName,
      description: app.description,
      status: toAppSummaryStatus(app.stableStatus),
      currentVersion: app.current_version,
      publishedVersion: app.published_version,
      pages: parsePages(app.files),
      functions: this.config.registry.getFunctionDefinitions(slug, functionMode).map((fn) => ({
        name: fn.name,
        methods: [...fn.methods],
      })),
    };
  }

  private startApp(appName: string): AppLifecycleResult {
    const app = this.config.appManager.startStable(normalizeAppName(appName));
    return toLifecycleResult(app.slug, app.displayName, app.stableStatus);
  }

  private stopApp(appName: string): AppLifecycleResult {
    const app = this.config.appManager.stopStable(normalizeAppName(appName));
    return toLifecycleResult(app.slug, app.displayName, app.stableStatus);
  }

  private deleteApp(appName: string): DeleteAppResult {
    const slug = normalizeAppName(appName);
    this.config.appManager.delete(slug);
    return { slug, deleted: true };
  }

  private async createApp(idea: string): Promise<DelegatedToolResult> {
    const normalizedIdea = idea.trim();
    if (!normalizedIdea) {
      throw new Error('idea is required');
    }

    const builderRuntime = this.config.resolveBuilderRuntime();
    const info = await extractAppInfo(normalizedIdea, {
      provider: builderRuntime.agentProvider,
      cwd: this.config.agentDir,
      model: typeof builderRuntime.model === 'string' ? builderRuntime.model : undefined,
      providerOptions: builderRuntime.providerOptionsFactory?.({
        appSlug: '__extract__',
        agentDir: this.config.agentDir,
        mode: 'extract',
      }),
    });
    const slug = deduplicateSlug(info.slug, (candidate) => this.config.appManager.exists(candidate));
    await this.config.appManager.create(slug, info.description, info.displayName);
    return this.enqueueDelegatedTask({
      appSlug: slug,
      instruction: normalizedIdea,
      target: 'builder',
      type: 'create',
    });
  }

  private async developApp(appName: string, instruction: string): Promise<DelegatedToolResult> {
    const slug = normalizeAppName(appName);
    this.config.appManager.get(slug);
    return this.enqueueDelegatedTask({
      appSlug: slug,
      instruction: instruction.trim(),
      target: 'builder',
      type: 'develop',
    });
  }

  private async operateApp(appName: string, instruction: string): Promise<DelegatedToolResult> {
    const slug = normalizeAppName(appName);
    const app = this.config.appManager.get(slug);
    if (app.stableStatus === null) {
      throw new Error(`App '${slug}' has no published stable version`);
    }
    if (app.stableStatus !== 'running') {
      throw new Error(`App '${slug}' stable runtime is not running`);
    }
    return this.enqueueDelegatedTask({
      appSlug: slug,
      instruction: instruction.trim(),
      target: 'operator',
      type: 'operate',
    });
  }

  private enqueueDelegatedTask(task: EnqueueTaskInput): DelegatedToolResult {
    const queuedTask = this.taskRegistry.enqueue(task);
    this.session?.registerDelegatedTask(queuedTask.taskId);
    return {
      taskId: queuedTask.taskId,
      appSlug: queuedTask.appSlug,
      status: queuedTask.status === 'running' ? 'running' : 'queued',
    };
  }
}

function normalizeAppName(appName: string): string {
  const normalized = appName.trim();
  if (!normalized) {
    throw new Error('app_name is required');
  }
  return normalized;
}

function toAppSummaryStatus(status: 'running' | 'stopped' | null): AppSummaryStatus {
  return status ?? 'draft-only';
}

function toLifecycleResult(
  slug: string,
  displayName: string,
  status: 'running' | 'stopped' | null,
): AppLifecycleResult {
  return {
    slug,
    displayName,
    status: toAppSummaryStatus(status),
  };
}

function parsePages(
  files: Array<{ path: string; content: string }>,
): AppPageSummary[] {
  const pagesFile = files.find((file) => file.path === 'ui/pages.json');
  if (!pagesFile) {
    return [];
  }

  try {
    const parsed = JSON.parse(pagesFile.content) as {
      pages?: Array<{ path?: unknown; title?: unknown }>;
    };
    return (parsed.pages ?? [])
      .map((page) => ({
        path: typeof page.path === 'string' ? page.path : '/',
        title: typeof page.title === 'string' ? page.title : '',
      }))
      .filter((page) => page.path);
  } catch {
    return [];
  }
}
