import type { Workspace } from '../../core/workspace';
import type { AppRegistry, PlatformClient } from '@cozybase/runtime';
import { normalizeRuntimeSchema, type AppContext } from '@cozybase/operator-agent';
import { OperatorSession } from './session';
import type { RuntimeSessionStore } from '../runtime-session-store';
import type { OperatorRuntimeConfig } from './runtime-config';

export interface OperatorSessionManagerConfig {
  workspace: Workspace;
  workspaceDir?: string;
  agentDir?: string;
  registry: AppRegistry;
  stablePlatformClient: PlatformClient;
  runtimeStore: RuntimeSessionStore;
  runtimeResolver: () => OperatorRuntimeConfig;
}

export class OperatorSessionManager {
  private sessions = new Map<string, OperatorSession>();
  private readonly toolsDisabled =
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === '1' ||
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === 'true';

  constructor(private readonly config: OperatorSessionManagerConfig) {}

  getOrCreate(appSlug: string): OperatorSession {
    const existing = this.sessions.get(appSlug);
    if (existing) {
      return existing;
    }

    this.config.workspace.refreshAppState(appSlug);
    const state = this.config.workspace.getAppState(appSlug);
    if (!state) {
      throw new Error(`App '${appSlug}' not found`);
    }
    if (state.stableStatus === null) {
      throw new Error(`App '${appSlug}' has no published stable version`);
    }
    if (state.stableStatus !== 'running') {
      throw new Error(`App '${appSlug}' stable runtime is not running`);
    }

    const app = this.config.workspace.getPlatformRepo().apps.findBySlug(appSlug);
    if (!app) {
      throw new Error(`App '${appSlug}' not found`);
    }

    const session = new OperatorSession({
      appSlug,
      displayName: app.display_name,
      description: app.description,
      loadAppContext: () => this.loadAppContext(appSlug, app.display_name, app.description),
      callApi: (path: string, options?: RequestInit) => this.config.stablePlatformClient.call(appSlug, path, options),
      cwd: this.config.agentDir,
      workspaceDir: this.config.workspaceDir ?? this.config.workspace.root,
      runtimeResolver: this.config.runtimeResolver,
      runtimeStore: this.config.runtimeStore,
    });
    this.sessions.set(appSlug, session);
    return session;
  }

  get(appSlug: string): OperatorSession | undefined {
    return this.sessions.get(appSlug);
  }

  remove(appSlug: string): void {
    const session = this.sessions.get(appSlug);
    if (session) {
      session.shutdown();
      this.sessions.delete(appSlug);
    }
    this.config.runtimeStore.clearSession('operator', appSlug);
  }

  shutdown(): void {
    for (const session of this.sessions.values()) {
      session.shutdown();
    }
    this.sessions.clear();
  }

  private async loadAppContext(
    appSlug: string,
    displayName: string,
    description: string,
  ): Promise<AppContext> {
    if (this.toolsDisabled) {
      return this.buildPromptOnlyAppContext(displayName, description);
    }

    const response = await this.config.stablePlatformClient.call(appSlug, '_db/schemas');
    const payload = await response.json() as { data?: Record<string, { columns?: Array<Record<string, unknown>> }> };
    if (!response.ok) {
      const message = (payload as { error?: { message?: string } }).error?.message ?? response.statusText;
      throw new Error(message || `Failed to load schema for '${appSlug}'`);
    }

    return {
      displayName,
      description,
      schema: normalizeRuntimeSchema(payload.data ?? {}),
      functions: this.config.registry.getFunctionDefinitions(appSlug, 'stable').map((fn) => ({
        name: fn.name,
        methods: [...fn.methods],
      })),
    };
  }

  private buildPromptOnlyAppContext(
    displayName: string,
    description: string,
  ): AppContext {
    return {
      displayName,
      description,
      schema: [],
      functions: [],
    };
  }
}
