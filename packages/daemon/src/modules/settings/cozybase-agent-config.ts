export const VALID_COZYBASE_AGENT_PROVIDERS = ['claude-code', 'codex'] as const;

export type CozyBaseAgentProviderKind = (typeof VALID_COZYBASE_AGENT_PROVIDERS)[number];

export const VALID_COZYBASE_MODEL_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

export type CozyBaseModelProviderKind = (typeof VALID_COZYBASE_MODEL_PROVIDERS)[number];

export const VALID_COZYBASE_MODELS: Record<CozyBaseAgentProviderKind, readonly string[]> = {
  'claude-code': ['claude-sonnet-4-6', 'claude-opus-4-6'],
  codex: ['gpt-5.4', 'gpt-5.3-codex'],
};

export const DEFAULT_COZYBASE_AGENT_PROVIDER: CozyBaseAgentProviderKind = 'claude-code';
export const DEFAULT_COZYBASE_MODEL_PROVIDER: CozyBaseModelProviderKind = 'anthropic';
export const DEFAULT_COZYBASE_MODEL = 'claude-sonnet-4-6';

export interface StoredCozyBaseAgentConfig {
  agentProvider?: string | null;
  modelProvider?: string | null;
  model?: string | null;
  envAgentProvider?: string | null;
  envModelProvider?: string | null;
  envModel?: string | null;
}

export interface EffectiveCozyBaseAgentConfig {
  agentProvider: CozyBaseAgentProviderKind;
  modelProvider: CozyBaseModelProviderKind | null;
  model: string;
}

export function normalizeCozyBaseAgentProvider(
  value: string | null | undefined,
): CozyBaseAgentProviderKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === 'claude') {
    return 'claude-code';
  }
  if (VALID_COZYBASE_AGENT_PROVIDERS.includes(normalized as CozyBaseAgentProviderKind)) {
    return normalized as CozyBaseAgentProviderKind;
  }
  return null;
}

export function normalizeCozyBaseModelProvider(
  value: string | null | undefined,
): CozyBaseModelProviderKind | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (VALID_COZYBASE_MODEL_PROVIDERS.includes(normalized as CozyBaseModelProviderKind)) {
    return normalized as CozyBaseModelProviderKind;
  }
  return null;
}

export function getDefaultCozyBaseModel(provider: CozyBaseAgentProviderKind): string {
  return VALID_COZYBASE_MODELS[provider][0] ?? DEFAULT_COZYBASE_MODEL;
}

export function isValidCozyBaseModelForProvider(
  provider: CozyBaseAgentProviderKind,
  model: string,
): boolean {
  return VALID_COZYBASE_MODELS[provider].includes(
    model as (typeof VALID_COZYBASE_MODELS)[CozyBaseAgentProviderKind][number],
  );
}

export function resolveEffectiveCozyBaseAgentConfig(
  params: StoredCozyBaseAgentConfig,
): EffectiveCozyBaseAgentConfig {
  const provider =
    normalizeCozyBaseAgentProvider(params.agentProvider)
    ?? normalizeCozyBaseAgentProvider(params.envAgentProvider)
    ?? DEFAULT_COZYBASE_AGENT_PROVIDER;
  const modelProvider =
    normalizeCozyBaseModelProvider(params.modelProvider)
    ?? normalizeCozyBaseModelProvider(params.envModelProvider)
    ?? DEFAULT_COZYBASE_MODEL_PROVIDER;
  const candidateModel =
    firstNonEmpty(params.model, params.envModel) ?? getDefaultCozyBaseModel(provider);

  return {
    agentProvider: provider,
    modelProvider,
    model: isValidCozyBaseModelForProvider(provider, candidateModel)
      ? candidateModel
      : getDefaultCozyBaseModel(provider),
  };
}

export function getCozyBaseProviderMeta() {
  return {
    providers: VALID_COZYBASE_AGENT_PROVIDERS,
    modelProviders: VALID_COZYBASE_MODEL_PROVIDERS,
    models: VALID_COZYBASE_MODELS,
  };
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}
