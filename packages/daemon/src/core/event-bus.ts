type Listener<T> = (data: T) => void;

export interface ChangeEvent {
  appId: string;
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
}

export interface AppReconciledEvent {
  appSlug: string;
}

export interface TaskCompletedEvent {
  taskId: string;
  appSlug: string;
  summary: string;
}

export interface TaskFailedEvent {
  taskId: string;
  appSlug: string;
  error: string;
}

export interface EventMap {
  'app:reconciled': AppReconciledEvent;
  'task:completed': TaskCompletedEvent;
  'task:failed': TaskFailedEvent;
}

type WildcardEvent = { event: keyof EventMap; data: EventMap[keyof EventMap] };

export class EventBus {
  private listeners = new Map<string, Set<Listener<unknown>>>();

  on<K extends keyof EventMap | '*'>(
    event: K,
    listener: Listener<K extends '*' ? WildcardEvent : EventMap[Extract<K, keyof EventMap>]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends keyof EventMap | '*'>(
    event: K,
    listener: Listener<K extends '*' ? WildcardEvent : EventMap[Extract<K, keyof EventMap>]>,
  ): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    this.listeners.get(event)?.forEach((fn) => (fn as Listener<EventMap[K]>)(data));
    this.listeners.get('*')?.forEach((fn) => {
      (fn as Listener<WildcardEvent>)({ event, data });
    });
  }
}

export const eventBus = new EventBus();
