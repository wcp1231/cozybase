import type { AgentProviderRegistry, AgentRuntimeProvider } from '@cozybase/ai-runtime';
import { getModel } from '@mariozechner/pi-ai';
import type { Workspace } from '../../core/workspace';
import { resolveEffectiveAgentConfig } from '../../modules/settings/agent-config';
import {
  DEFAULT_OPERATOR_AGENT_PROVIDER,
  DEFAULT_OPERATOR_MODEL_PROVIDER,
  DEFAULT_PI_AGENT_MODEL,
  type OperatorAgentProviderKind,
  getDefaultOperatorModel,
  normalizeOperatorAgentProvider,
  resolveEffectiveOperatorAgentConfig,
  resolvePiApiKey,
} from '../../modules/settings/operator-agent-config';

export interface OperatorRuntimeConfig {
  agentProvider: AgentRuntimeProvider;
  providerKind: OperatorAgentProviderKind;
  model: unknown;
  toolMode: 'native' | 'mcp';
  getApiKey?: () => string | undefined;
}

const PROVIDER_REGISTRY_KIND: Record<OperatorAgentProviderKind, string> = {
  'pi-agent-core': 'pi-agent-core',
  codex: 'codex',
  'claude-code': 'claude',
};

const PROVIDER_TOOL_MODE: Record<OperatorAgentProviderKind, 'native' | 'mcp'> = {
  'pi-agent-core': 'native',
  codex: 'mcp',
  'claude-code': 'mcp',
};

export function resolveOperatorRuntime(
  workspace: Workspace,
  providerRegistry: AgentProviderRegistry,
): OperatorRuntimeConfig {
  workspace.load();

  const platformRepo = workspace.getPlatformRepo();
  const storedAgentProvider = platformRepo.settings.get('operator.agent_provider');
  const storedModelProvider = platformRepo.settings.get('operator.model_provider');
  const storedModel = platformRepo.settings.get('operator.model');
  let configuredAgentProvider = normalizeOperatorAgentProvider(storedAgentProvider);
  const toolsDisabled =
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === '1' ||
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === 'true';

  if (!configuredAgentProvider && toolsDisabled) {
    configuredAgentProvider = resolveDebugOperatorProviderFromBuilder(workspace);
  }

  const providerKind = resolveAvailableProviderKind(
    providerRegistry,
    configuredAgentProvider,
    Boolean(configuredAgentProvider),
  );
  const hasStoredOperatorConfig = Boolean(storedAgentProvider || storedModelProvider || storedModel);
  let effectiveConfig = resolveEffectiveOperatorAgentConfig({
    agentProvider: storedAgentProvider,
    modelProvider: storedModelProvider,
    model: storedModel,
  });

  if (
    !hasStoredOperatorConfig &&
    toolsDisabled &&
    configuredAgentProvider &&
    configuredAgentProvider !== 'pi-agent-core'
  ) {
    const builder = resolveEffectiveAgentConfig({
      storedProvider: workspace.getPlatformRepo().settings.get('agent.provider'),
      storedModel: workspace.getPlatformRepo().settings.get('agent.model'),
      envProvider: process.env.COZYBASE_AGENT_PROVIDER,
      envModel: process.env.COZYBASE_AGENT_MODEL,
    });
    effectiveConfig = {
      agentProvider: configuredAgentProvider,
      modelProvider: null,
      model: builder.model,
    };
  }
  const registryProvider = providerRegistry.require(PROVIDER_REGISTRY_KIND[providerKind]);

  if (providerKind === 'pi-agent-core') {
    const modelName = effectiveConfig.model || DEFAULT_PI_AGENT_MODEL;
    const resolvedProvider = effectiveConfig.modelProvider ?? DEFAULT_OPERATOR_MODEL_PROVIDER;

    try {
      return {
        agentProvider: registryProvider,
        providerKind,
        model: getModel(resolvedProvider, modelName as never),
        toolMode: PROVIDER_TOOL_MODE[providerKind],
        getApiKey: () => resolvePiApiKey(resolvedProvider),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[operator] Invalid operator model config provider='${resolvedProvider}' model='${modelName}'. ` +
          `Falling back to ${DEFAULT_OPERATOR_MODEL_PROVIDER}/${DEFAULT_PI_AGENT_MODEL}. ${message}`,
      );
      return {
        agentProvider: registryProvider,
        providerKind,
        model: getModel(DEFAULT_OPERATOR_MODEL_PROVIDER, DEFAULT_PI_AGENT_MODEL as never),
        toolMode: PROVIDER_TOOL_MODE[providerKind],
        getApiKey: () => resolvePiApiKey(DEFAULT_OPERATOR_MODEL_PROVIDER),
      };
    }
  }

  return {
    agentProvider: registryProvider,
    providerKind,
    model: effectiveConfig.model || getDefaultOperatorModel(providerKind),
    toolMode: PROVIDER_TOOL_MODE[providerKind],
  };
}

function resolveAvailableProviderKind(
  providerRegistry: AgentProviderRegistry,
  providerKind: OperatorAgentProviderKind | null,
  explicit: boolean,
): OperatorAgentProviderKind {
  const resolved = providerKind ?? DEFAULT_OPERATOR_AGENT_PROVIDER;
  const registryKind = PROVIDER_REGISTRY_KIND[resolved];
  try {
    providerRegistry.require(registryKind);
    return resolved;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (resolved === DEFAULT_OPERATOR_AGENT_PROVIDER || explicit) {
      throw err;
    }
    console.warn(
      `[operator] Runtime provider '${resolved}' is unavailable. ` +
        `Falling back to '${DEFAULT_OPERATOR_AGENT_PROVIDER}'. ${message}`,
    );
    return DEFAULT_OPERATOR_AGENT_PROVIDER;
  }
}

function resolveDebugOperatorProviderFromBuilder(workspace: Workspace): OperatorAgentProviderKind {
  const builder = resolveEffectiveAgentConfig({
    storedProvider: workspace.getPlatformRepo().settings.get('agent.provider'),
    storedModel: workspace.getPlatformRepo().settings.get('agent.model'),
    envProvider: process.env.COZYBASE_AGENT_PROVIDER,
    envModel: process.env.COZYBASE_AGENT_MODEL,
  });
  return builder.provider === 'codex' ? 'codex' : 'claude-code';
}
