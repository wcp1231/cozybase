type Listener = (data: any) => void;

export interface ChangeEvent {
  appId: string;
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
}

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, listener: Listener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach((fn) => fn(data));
    // Also emit to wildcard listeners
    this.listeners.get('*')?.forEach((fn) => fn({ event, data }));
  }
}

export const eventBus = new EventBus();
