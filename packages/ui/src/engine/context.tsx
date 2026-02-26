import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ComponentSchema, CustomComponentSchema } from '../schema/types';

// ---- Types ----

interface ComponentState {
  value?: unknown;
  data?: unknown;
  loading?: boolean;
}

interface DialogEntry {
  id: string;
  title: string;
  body: ComponentSchema;
  width?: number | string;
}

interface PageContextValue {
  baseUrl: string;
  customComponents?: Record<string, CustomComponentSchema>;
  // Component state
  registerComponent: (id: string, state: ComponentState) => void;
  unregisterComponent: (id: string) => void;
  updateComponent: (id: string, state: Partial<ComponentState>) => void;
  getComponentState: (id: string) => ComponentState | undefined;
  subscribeComponents: (callback: () => void) => () => void;
  getComponentsSnapshot: () => Record<string, ComponentState>;
  // Reload
  triggerReload: (target: string) => void;
  subscribeReload: (target: string, callback: () => void) => () => void;
  // Dialog
  openDialog: (entry: DialogEntry) => void;
  closeDialog: () => void;
  subscribeDialogs: (callback: () => void) => () => void;
  getDialogsSnapshot: () => DialogEntry[];
}

// ---- Context ----

const PageCtx = createContext<PageContextValue | null>(null);

export function usePageContext(): PageContextValue {
  const ctx = useContext(PageCtx);
  if (!ctx) throw new Error('usePageContext must be used within PageProvider');
  return ctx;
}

// ---- Hook for reading component states reactively ----

export function useComponentStates(): Record<string, ComponentState> {
  const ctx = usePageContext();
  return useSyncExternalStore(
    ctx.subscribeComponents,
    ctx.getComponentsSnapshot,
  );
}

// ---- Hook for listening to reload signals ----

export function useReloadSignal(id: string, callback: () => void): void {
  const ctx = usePageContext();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // Subscribe on mount, unsub on unmount
  const stableCb = useCallback(() => callbackRef.current(), []);
  // We use useRef + manual subscribe to avoid re-subscribing on every render
  const unsubRef = useRef<(() => void) | null>(null);
  if (unsubRef.current === null) {
    unsubRef.current = ctx.subscribeReload(id, stableCb);
  }
}

// ---- Hook for dialog stack ----

export function useDialogs(): DialogEntry[] {
  const ctx = usePageContext();
  return useSyncExternalStore(ctx.subscribeDialogs, ctx.getDialogsSnapshot);
}

// ---- Provider ----

export function PageProvider({
  baseUrl,
  customComponents,
  children,
}: {
  baseUrl: string;
  customComponents?: Record<string, CustomComponentSchema>;
  children: ReactNode;
}) {
  // Using refs for mutable state that drives external-store subscriptions.
  const componentsRef = useRef<Record<string, ComponentState>>({});
  const componentsListeners = useRef(new Set<() => void>());
  const componentsSnapshotRef = useRef<Record<string, ComponentState>>({});

  const reloadListeners = useRef<Record<string, Set<() => void>>>({});

  const dialogsRef = useRef<DialogEntry[]>([]);
  const dialogsListeners = useRef(new Set<() => void>());
  const dialogsSnapshotRef = useRef<DialogEntry[]>([]);

  const notifyComponents = useCallback(() => {
    componentsSnapshotRef.current = { ...componentsRef.current };
    componentsListeners.current.forEach((l) => l());
  }, []);

  const notifyDialogs = useCallback(() => {
    dialogsSnapshotRef.current = [...dialogsRef.current];
    dialogsListeners.current.forEach((l) => l());
  }, []);

  const value: PageContextValue = {
    baseUrl,
    customComponents,

    registerComponent: (id, state) => {
      componentsRef.current[id] = state;
      notifyComponents();
    },
    unregisterComponent: (id) => {
      delete componentsRef.current[id];
      notifyComponents();
    },
    updateComponent: (id, partial) => {
      const current = componentsRef.current[id];
      if (current) {
        componentsRef.current[id] = { ...current, ...partial };
        notifyComponents();
      }
    },
    getComponentState: (id) => componentsRef.current[id],
    subscribeComponents: (cb) => {
      componentsListeners.current.add(cb);
      return () => componentsListeners.current.delete(cb);
    },
    getComponentsSnapshot: () => componentsSnapshotRef.current,

    triggerReload: (target) => {
      reloadListeners.current[target]?.forEach((cb) => cb());
    },
    subscribeReload: (target, cb) => {
      if (!reloadListeners.current[target]) {
        reloadListeners.current[target] = new Set();
      }
      reloadListeners.current[target].add(cb);
      return () => {
        reloadListeners.current[target]?.delete(cb);
        if (reloadListeners.current[target]?.size === 0) {
          delete reloadListeners.current[target];
        }
      };
    },

    openDialog: (entry) => {
      dialogsRef.current = [...dialogsRef.current, entry];
      notifyDialogs();
    },
    closeDialog: () => {
      dialogsRef.current = dialogsRef.current.slice(0, -1);
      notifyDialogs();
    },

    subscribeDialogs: (cb) => {
      dialogsListeners.current.add(cb);
      return () => dialogsListeners.current.delete(cb);
    },
    getDialogsSnapshot: () => dialogsSnapshotRef.current,
  };

  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>;
}
