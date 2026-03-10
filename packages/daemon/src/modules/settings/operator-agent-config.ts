import { getApiKey, getModel } from '@mariozechner/pi-ai';

export const VALID_OPERATOR_AGENT_PROVIDERS = ['pi-agent-core', 'codex', 'claude-code'] as const;

export type OperatorAgentProviderKind = (typeof VALID_OPERATOR_AGENT_PROVIDERS)[number];

export const VALID_OPERATOR_MODEL_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

export type OperatorModelProviderKind = (typeof VALID_OPERATOR_MODEL_PROVIDERS)[number];

export const VALID_OPERATOR_MODELS: Record<Exclude<OperatorAgentProviderKind, 'pi-agent-core'>, readonly string[]> = {
  codex: ['gpt-5.4', 'gpt-5.3-codex'],
  'claude-code': ['claude-sonnet-4-6', 'claude-opus-4-6'],
};

export const DEFAULT_OPERATOR_AGENT_PROVIDER: OperatorAgentProviderKind = 'pi-agent-core';
export const DEFAULT_OPERATOR_MODEL_PROVIDER: OperatorModelProviderKind = 'anthropic';
export const DEFAULT_PI_AGENT_MODEL = 'claude-sonnet-4-20250514';

export interface StoredOperatorAgentConfig {
  agentProvider?: string | null;
  modelProvider?: string | null;
  model?: string | null;
}

export interface EffectiveOperatorAgentConfig {
  agentProvider: OperatorAgentProviderKind;
  modelProvider: OperatorModelProviderKind | null;
  model: string;
}

export function normalizeOperatorAgentProvider(value: string | null | undefined): OperatorAgentProviderKind | null {
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
  return null;
}

export function normalizeOperatorModelProvider(value: string | null | undefined): OperatorModelProviderKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (VALID_OPERATOR_MODEL_PROVIDERS.includes(normalized as OperatorModelProviderKind)) {
    return normalized as OperatorModelProviderKind;
  }
  return null;
}

export function getDefaultOperatorModel(provider: OperatorAgentProviderKind): string {
  if (provider === 'pi-agent-core') {
    return DEFAULT_PI_AGENT_MODEL;
  }
  return VALID_OPERATOR_MODELS[provider][0] ?? '';
}

export function isValidOperatorModelForProvider(
  provider: Exclude<OperatorAgentProviderKind, 'pi-agent-core'>,
  model: string,
): boolean {
  return VALID_OPERATOR_MODELS[provider].includes(model as (typeof VALID_OPERATOR_MODELS)[typeof provider][number]);
}

export function isValidPiAgentModel(modelProvider: OperatorModelProviderKind, model: string): boolean {
  try {
    getModel(modelProvider, model as never);
    return true;
  } catch {
    return false;
  }
}

export function resolveEffectiveOperatorAgentConfig(
  params: StoredOperatorAgentConfig,
): EffectiveOperatorAgentConfig {
  const provider = normalizeOperatorAgentProvider(params.agentProvider) ?? DEFAULT_OPERATOR_AGENT_PROVIDER;

  if (provider === 'pi-agent-core') {
    const explicitModelProvider = normalizeOperatorModelProvider(params.modelProvider);
    const modelProvider = explicitModelProvider ?? DEFAULT_OPERATOR_MODEL_PROVIDER;
    const candidateModel = params.model?.trim() || DEFAULT_PI_AGENT_MODEL;

    return {
      agentProvider: provider,
      modelProvider,
      model: isValidPiAgentModel(modelProvider, candidateModel)
        ? candidateModel
        : DEFAULT_PI_AGENT_MODEL,
    };
  }

  const candidateModel = params.model?.trim() || getDefaultOperatorModel(provider);
  return {
    agentProvider: provider,
    modelProvider: null,
    model: isValidOperatorModelForProvider(provider, candidateModel)
      ? candidateModel
      : getDefaultOperatorModel(provider),
  };
}

export function getOperatorProviderMeta() {
  return {
    providers: VALID_OPERATOR_AGENT_PROVIDERS,
    modelProviders: VALID_OPERATOR_MODEL_PROVIDERS,
    models: VALID_OPERATOR_MODELS,
  };
}

export function resolvePiApiKey(modelProvider: OperatorModelProviderKind): string | undefined {
  return getApiKey(modelProvider);
}
