import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { ComponentSchema, CustomComponentSchema, ExpressionContext } from '../schema/types';

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
  expressionContext?: Partial<ExpressionContext>;
}

interface ConfirmEntry {
  message: string;
  resolve: (result: boolean) => void;
}

interface PageContextValue {
  baseUrl: string;
  customComponents?: Record<string, CustomComponentSchema>;
  navigate?: (url: string) => void;
  // Component state
  registerComponent: (id: string, state: ComponentState) => void;
  unregisterComponent: (id: string) => void;
  updateComponent: (id: string, state: Partial<ComponentState>) => void;
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
  // Confirm
  requestConfirm: (message: string) => Promise<boolean>;
  resolveConfirm: (result: boolean) => void;
  subscribeConfirm: (callback: () => void) => () => void;
  getConfirmSnapshot: () => ConfirmEntry | null;
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

// ---- Hook for dialog stack ----

export function useDialogs(): DialogEntry[] {
  const ctx = usePageContext();
  return useSyncExternalStore(ctx.subscribeDialogs, ctx.getDialogsSnapshot);
}

// ---- Hook for confirm dialog ----

export function useConfirm(): ConfirmEntry | null {
  const ctx = usePageContext();
  return useSyncExternalStore(ctx.subscribeConfirm, ctx.getConfirmSnapshot);
}

// ---- Provider ----

export function PageProvider({
  baseUrl,
  customComponents,
  navigate,
  children,
}: {
  baseUrl: string;
  customComponents?: Record<string, CustomComponentSchema>;
  navigate?: (url: string) => void;
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

  const confirmRef = useRef<ConfirmEntry | null>(null);
  const confirmListeners = useRef(new Set<() => void>());
  const confirmSnapshotRef = useRef<ConfirmEntry | null>(null);

  const notifyComponents = useCallback(() => {
    componentsSnapshotRef.current = { ...componentsRef.current };
    componentsListeners.current.forEach((l) => l());
  }, []);

  const notifyDialogs = useCallback(() => {
    dialogsSnapshotRef.current = [...dialogsRef.current];
    dialogsListeners.current.forEach((l) => l());
  }, []);

  const notifyConfirm = useCallback(() => {
    confirmSnapshotRef.current = confirmRef.current;
    confirmListeners.current.forEach((l) => l());
  }, []);

  const value: PageContextValue = {
    baseUrl,
    customComponents,
    navigate,

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

    requestConfirm: (message: string) => {
      return new Promise<boolean>((resolve) => {
        confirmRef.current = { message, resolve };
        notifyConfirm();
      });
    },
    resolveConfirm: (result: boolean) => {
      const entry = confirmRef.current;
      if (entry) {
        entry.resolve(result);
        confirmRef.current = null;
        notifyConfirm();
      }
    },
    subscribeConfirm: (cb) => {
      confirmListeners.current.add(cb);
      return () => confirmListeners.current.delete(cb);
    },
    getConfirmSnapshot: () => confirmSnapshotRef.current,
  };

  return <PageCtx.Provider value={value}>{children}</PageCtx.Provider>;
}
