import type {
  AgentEvent,
  AgentProvider,
  AgentQuery,
  AgentQueryConfig,
  AgentRuntimeSession,
  ProviderSessionSnapshot,
  StoredMessage,
} from './types.js';

type QueryConfigFactory = (text: string, resumeSessionId: string | null) => AgentQueryConfig;

export class QueryBackedRuntimeSession implements AgentRuntimeSession {
  private readonly listeners = new Set<(event: AgentEvent) => void>();
  private readonly history: StoredMessage[] = [];
  private activeQuery: AgentQuery | null = null;
  private resumeSessionId: string | null;

  constructor(
    private readonly providerKind: string,
    private readonly provider: AgentProvider,
    private readonly configFactory: QueryConfigFactory,
    initialResumeSessionId: string | null = null,
  ) {
    this.resumeSessionId = initialResumeSessionId;
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async prompt(text: string): Promise<void> {
    if (this.activeQuery) {
      throw new Error('Agent session is already processing a prompt');
    }

    const query = this.provider.createQuery(this.configFactory(text, this.resumeSessionId));
    this.activeQuery = query;
    this.history.push({ role: 'user', content: text });

    try {
      for await (const event of query) {
        this.handleEvent(event);
        this.emit(event);
      }
    } finally {
      this.activeQuery = null;
    }
  }

  async interrupt(): Promise<void> {
    await this.activeQuery?.interrupt();
  }

  close(): void {
    this.activeQuery?.close();
    this.activeQuery = null;
  }

  async exportSnapshot(): Promise<ProviderSessionSnapshot | null> {
    return {
      providerKind: this.providerKind,
      version: 1,
      state: {
        resumeSessionId: this.resumeSessionId,
        history: this.history,
      },
    };
  }

  async restoreSnapshot(snapshot: ProviderSessionSnapshot): Promise<void> {
    if (snapshot.providerKind !== this.providerKind) {
      throw new Error(`Snapshot provider mismatch: expected '${this.providerKind}', got '${snapshot.providerKind}'`);
    }

    const state = (snapshot.state ?? {}) as {
      resumeSessionId?: unknown;
      history?: unknown;
    };
    this.resumeSessionId = typeof state.resumeSessionId === 'string'
      ? state.resumeSessionId
      : null;
    this.history.length = 0;
    if (Array.isArray(state.history)) {
      this.history.push(...state.history as StoredMessage[]);
    }
  }

  async getHistory(): Promise<StoredMessage[]> {
    return [...this.history];
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private handleEvent(event: AgentEvent): void {
    switch (event.type) {
      case 'conversation.message.completed':
        if (event.role === 'assistant') {
          this.history.push({ role: 'assistant', content: event.content });
        }
        break;
      case 'conversation.tool.completed':
        this.history.push({
          role: 'tool',
          toolName: event.toolName,
          status: 'done',
          summary: event.summary,
        });
        break;
      case 'conversation.run.completed':
        this.resumeSessionId = event.sessionId || this.resumeSessionId;
        break;
      default:
        break;
    }
  }
}
