import type { AgentProvider, AgentProviderRegistry, AgentRuntimeProvider } from '@cozybase/ai-runtime';
import type { Workspace } from '../../core/workspace';
import {
  resolveEffectiveCozyBaseAgentConfig,
  type CozyBaseAgentProviderKind,
} from '../../modules/settings/cozybase-agent-config';

export interface CozyBaseRuntimeConfig {
  agentProvider: AgentRuntimeProvider & AgentProvider;
  providerKind: CozyBaseAgentProviderKind;
  model: string;
}

const PROVIDER_REGISTRY_KIND: Record<CozyBaseAgentProviderKind, string> = {
  'claude-code': 'claude',
  codex: 'codex',
};

export function resolveCozyBaseRuntime(
  workspace: Workspace,
  providerRegistry: AgentProviderRegistry,
): CozyBaseRuntimeConfig {
  workspace.load();

  const config = resolveEffectiveCozyBaseAgentConfig({
    agentProvider: workspace.getPlatformRepo().settings.get('cozybase_agent.agent_provider'),
    modelProvider: workspace.getPlatformRepo().settings.get('cozybase_agent.model_provider'),
    model: workspace.getPlatformRepo().settings.get('cozybase_agent.model'),
    envAgentProvider: process.env.COZYBASE_AGENT_PROVIDER,
    envModelProvider: process.env.COZYBASE_AGENT_MODEL_PROVIDER,
    envModel: process.env.COZYBASE_AGENT_MODEL,
  });

  const provider = providerRegistry.require(PROVIDER_REGISTRY_KIND[config.agentProvider]);
  if (!('createQuery' in provider) || typeof provider.createQuery !== 'function') {
    throw new Error(`CozyBase provider '${config.agentProvider}' does not support query-backed sessions`);
  }

  return {
    agentProvider: provider as AgentRuntimeProvider & AgentProvider,
    providerKind: config.agentProvider,
    model: config.model,
  };
}
