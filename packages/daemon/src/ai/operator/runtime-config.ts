import type { AgentProviderRegistry, AgentRuntimeProvider } from '@cozybase/ai-runtime';
import { getApiKey, getModel, getProviders, type KnownProvider } from '@mariozechner/pi-ai';
import type { Workspace } from '../../core/workspace';
import { resolveEffectiveAgentConfig } from '../../modules/settings/agent-config';

export const VALID_OPERATOR_AGENT_PROVIDERS = ['pi-agent-core', 'codex', 'claude-code'] as const;

export type OperatorAgentProviderKind = (typeof VALID_OPERATOR_AGENT_PROVIDERS)[number];

export interface OperatorRuntimeConfig {
  agentProvider: AgentRuntimeProvider;
  providerKind: OperatorAgentProviderKind;
  model: unknown;
  toolMode: 'native' | 'mcp';
  getApiKey?: () => string | undefined;
}

const DEFAULT_MODEL_PROVIDER = 'anthropic';
const DEFAULT_PI_AGENT_MODEL = 'claude-sonnet-4-20250514';
const DEFAULT_CLAUDE_CODE_MODEL = 'claude-sonnet-4-6';
const DEFAULT_CODEX_MODEL = 'gpt-5.4';

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

  const rawAgentProvider = workspace.config.operator?.agent_provider;
  const legacyProvider = workspace.config.operator?.provider?.trim();
  let configuredAgentProvider = normalizeAgentProvider(rawAgentProvider);
  const toolsDisabled =
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === '1' ||
    process.env.COZYBASE_OPERATOR_DISABLE_TOOLS === 'true';

  if (!configuredAgentProvider) {
    const legacyAgentProvider = normalizeAgentProvider(legacyProvider);
    if (legacyAgentProvider) {
      configuredAgentProvider = legacyAgentProvider;
      console.warn(
        '[operator] workspace.yaml uses deprecated operator.provider for agent selection; ' +
          'treating it as operator.agent_provider.',
      );
    }
  }

  if (!configuredAgentProvider && toolsDisabled) {
    configuredAgentProvider = resolveDebugOperatorProviderFromBuilder(workspace);
  }

  const providerKind = resolveAvailableProviderKind(
    providerRegistry,
    configuredAgentProvider,
    Boolean(configuredAgentProvider),
  );
  const modelProvider = resolveModelProvider(workspace, providerKind, legacyProvider);
  const registryProvider = providerRegistry.require(PROVIDER_REGISTRY_KIND[providerKind]);

  if (providerKind === 'pi-agent-core') {
    const configuredModel = workspace.config.operator?.model?.trim();
    const modelName = configuredModel || DEFAULT_PI_AGENT_MODEL;
    const resolvedProvider = modelProvider ?? DEFAULT_MODEL_PROVIDER;

    try {
      return {
        agentProvider: registryProvider,
        providerKind,
        model: getModel(resolvedProvider, modelName as never),
        toolMode: PROVIDER_TOOL_MODE[providerKind],
        getApiKey: () => getApiKey(resolvedProvider),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `[operator] Invalid operator model config provider='${resolvedProvider}' model='${modelName}'. ` +
          `Falling back to ${DEFAULT_MODEL_PROVIDER}/${DEFAULT_PI_AGENT_MODEL}. ${message}`,
      );
      return {
        agentProvider: registryProvider,
        providerKind,
        model: getModel(DEFAULT_MODEL_PROVIDER, DEFAULT_PI_AGENT_MODEL),
        toolMode: PROVIDER_TOOL_MODE[providerKind],
        getApiKey: () => getApiKey(DEFAULT_MODEL_PROVIDER),
      };
    }
  }

  const configuredModel = workspace.config.operator?.model?.trim();
  return {
    agentProvider: registryProvider,
    providerKind,
    model: configuredModel || getDefaultModel(providerKind),
    toolMode: PROVIDER_TOOL_MODE[providerKind],
  };
}

function normalizeAgentProvider(value: string | undefined): OperatorAgentProviderKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'claude') {
    return 'claude-code';
  }
  if (VALID_OPERATOR_AGENT_PROVIDERS.includes(normalized as OperatorAgentProviderKind)) {
    return normalized as OperatorAgentProviderKind;
  }
  console.warn(
    `[operator] Unsupported operator.agent_provider='${value}'. ` +
      `Falling back to 'pi-agent-core'.`,
  );
  return null;
}

function resolveModelProvider(
  workspace: Workspace,
  providerKind: OperatorAgentProviderKind,
  legacyProvider: string | undefined,
): KnownProvider | undefined {
  if (providerKind !== 'pi-agent-core') {
    return undefined;
  }

  const configuredModelProvider = workspace.config.operator?.model_provider?.trim();
  const legacyLooksLikeAgentProvider = Boolean(normalizeAgentProvider(legacyProvider));
  if (!configuredModelProvider && legacyProvider && !legacyLooksLikeAgentProvider) {
    console.warn(
      '[operator] workspace.yaml uses deprecated operator.provider; ' +
        'treating it as operator.model_provider for pi-agent-core.',
    );
  }

  const candidate = configuredModelProvider || (legacyLooksLikeAgentProvider ? undefined : legacyProvider);
  if (candidate && getProviders().includes(candidate as KnownProvider)) {
    return candidate as KnownProvider;
  }
  return DEFAULT_MODEL_PROVIDER;
}

function resolveAvailableProviderKind(
  providerRegistry: AgentProviderRegistry,
  providerKind: OperatorAgentProviderKind | null,
  explicit: boolean,
): OperatorAgentProviderKind {
  const resolved = providerKind ?? 'pi-agent-core';
  const registryKind = PROVIDER_REGISTRY_KIND[resolved];
  try {
    providerRegistry.require(registryKind);
    return resolved;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (resolved === 'pi-agent-core' || explicit) {
      throw err;
    }
    console.warn(
      `[operator] Runtime provider '${resolved}' is unavailable. ` +
        `Falling back to 'pi-agent-core'. ${message}`,
    );
    return 'pi-agent-core';
  }
}

function getDefaultModel(providerKind: Exclude<OperatorAgentProviderKind, 'pi-agent-core'>): string {
  if (providerKind === 'codex') {
    return DEFAULT_CODEX_MODEL;
  }
  return DEFAULT_CLAUDE_CODE_MODEL;
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
