import type { AgentRuntimeProvider } from './types.js';

export class AgentProviderRegistry {
  private readonly providers = new Map<string, AgentRuntimeProvider>();

  register(provider: AgentRuntimeProvider): void {
    this.providers.set(provider.kind, provider);
  }

  get(kind: string): AgentRuntimeProvider | undefined {
    return this.providers.get(kind);
  }

  require(kind: string): AgentRuntimeProvider {
    const provider = this.get(kind);
    if (!provider) {
      throw new Error(`Agent provider '${kind}' is not registered`);
    }
    return provider;
  }

  list(): AgentRuntimeProvider[] {
    return Array.from(this.providers.values());
  }
}
