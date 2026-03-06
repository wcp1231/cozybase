export const VALID_AGENT_PROVIDERS = ['claude', 'codex'] as const;

export type AgentProviderKind = (typeof VALID_AGENT_PROVIDERS)[number];

export const VALID_MODELS: Record<AgentProviderKind, readonly string[]> = {
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6'],
  codex: ['gpt-5.3-codex', 'gpt-5.4'],
};

export function isValidAgentProvider(value: string): value is AgentProviderKind {
  return VALID_AGENT_PROVIDERS.includes(value as AgentProviderKind);
}

export function resolveAgentProviderKind(value: string | null | undefined): AgentProviderKind {
  if (value && isValidAgentProvider(value.trim().toLowerCase())) {
    return value.trim().toLowerCase() as AgentProviderKind;
  }
  return 'claude';
}

export function getDefaultAgentModel(provider: AgentProviderKind): string {
  return VALID_MODELS[provider][0] ?? '';
}

export function isValidModelForProvider(provider: AgentProviderKind, model: string): boolean {
  return VALID_MODELS[provider].includes(model as (typeof VALID_MODELS)[AgentProviderKind][number]);
}

export function resolveEffectiveAgentConfig(params: {
  storedProvider?: string | null;
  storedModel?: string | null;
  envProvider?: string | null;
  envModel?: string | null;
}): { provider: AgentProviderKind; model: string } {
  const provider = params.storedProvider
    ? resolveAgentProviderKind(params.storedProvider)
    : resolveAgentProviderKind(params.envProvider);
  const candidateModel = firstNonEmpty(params.storedModel, params.envModel);

  return {
    provider,
    model:
      candidateModel && isValidModelForProvider(provider, candidateModel)
        ? candidateModel
        : getDefaultAgentModel(provider),
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
