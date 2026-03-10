import { createContext, useContext, useEffect, useMemo, useState, type PointerEvent } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import type { PagesJson } from '@cozybase/ui';
import { MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { AppSidebar } from '../features/shell/app-sidebar';
import { ChatPanel } from '../features/shell/chat-panel';
import { useChatStore, type ChatSessionTarget } from '../stores/chat-store';
import { isAppMode, type AppMode } from './content-slot';
import type { AppInfo, AppSummary } from '../features/apps/types';

export interface AppContextValue {
  mode: AppMode;
  apps: AppSummary[];
  appsLoading: boolean;
  appsError: string | null;
  appName?: string;
  app: AppInfo | null;
  pagesJson: PagesJson | null;
  appLoading: boolean;
  appError: string | null;
  refreshApps: () => Promise<void>;
  refreshApp: () => Promise<void>;
  openSidebar: () => void;
  toggleSidebar: () => void;
  sidebarVisible: boolean;
}

export const AppContext = createContext<AppContextValue | null>(null);

const CHAT_PANEL_DEFAULT_WIDTH = 380;
const CHAT_PANEL_MIN_WIDTH = 320;
const CHAT_PANEL_MAX_WIDTH = 680;
const CHAT_PANEL_WIDTH_STORAGE_KEY = 'cozybase.chat-panel.width';

type AppFetchResult = {
  data: {
    slug: string;
    displayName?: string;
    description?: string;
    stableStatus: AppInfo['stableStatus'];
    hasDraft: boolean;
    current_version: number;
    published_version: number;
  };
};

type UiFetchResult = { data?: PagesJson };
type ErrorFetchResult = { error?: { message?: string } };

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const payload = await response.json() as ErrorFetchResult;
    const message = payload.error?.message;
    return typeof message === 'string' && message.trim() ? message : null;
  } catch {
    return null;
  }
}

function clampChatPanelWidth(width: number): number {
  return Math.min(CHAT_PANEL_MAX_WIDTH, Math.max(CHAT_PANEL_MIN_WIDTH, width));
}

export function resolveChatTarget(
  pathname: string,
  mode: AppMode | null,
  appName?: string,
): ChatSessionTarget | null {
  if (!mode) return null;
  const segments = pathname.split('/').filter(Boolean);
  if (mode === 'stable' && segments.length === 1 && segments[0] === 'stable') {
    return { kind: 'cozybase' };
  }
  if (!appName) return null;
  if (segments.length < 3) return null;
  if (segments[0] !== mode || segments[1] !== 'apps' || segments[2] !== appName) return null;
  if (segments[3] === 'console') return null;
  return { kind: mode === 'draft' ? 'builder' : 'operator', appName };
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppLayout');
  return ctx;
}

async function fetchUiSchema(
  appName: string,
  mode: AppMode,
  fetchImpl: typeof fetch,
): Promise<PagesJson | null> {
  const uiResponse = await fetchImpl(`/${mode}/apps/${appName}/ui`);
  if (uiResponse.status === 404) {
    return null;
  }
  if (!uiResponse.ok) {
    const message = await readErrorMessage(uiResponse);
    throw new Error(message ? `Failed to load UI: ${message}` : `Failed to load UI: HTTP ${uiResponse.status}`);
  }

  const uiJson = await uiResponse.json() as UiFetchResult;
  return uiJson ? (uiJson.data as PagesJson) : null;
}

export async function loadAppLayoutData(
  appName: string,
  mode: AppMode,
  fetchImpl: typeof fetch = fetch,
): Promise<{ app: AppInfo; pagesJson: PagesJson | null }> {
  const appResponse = await fetchImpl(`/api/v1/apps/${appName}`);
  if (!appResponse.ok) {
    const message = await readErrorMessage(appResponse);
    throw new Error(message ? `Failed to load app: ${message}` : `Failed to load app: HTTP ${appResponse.status}`);
  }

  const appJson = await appResponse.json() as AppFetchResult;
  const appData = appJson.data;
  const appInfo: AppInfo = {
    slug: appData.slug,
    displayName: appData.displayName ?? '',
    description: appData.description ?? '',
    stableStatus: appData.stableStatus,
    hasDraft: appData.hasDraft,
    current_version: appData.current_version,
    published_version: appData.published_version,
  };

  const pagesJson = await fetchUiSchema(appName, mode, fetchImpl);
  return { app: appInfo, pagesJson };
}

export function AppLayout() {
  const { appName, mode: modeParam } = useParams<{ appName: string; mode: string }>();
  const selectedMode = isAppMode(modeParam) ? modeParam : null;
  const location = useLocation();

  const [apps, setApps] = useState<AppSummary[]>([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [appsError, setAppsError] = useState<string | null>(null);

  const [app, setApp] = useState<AppInfo | null>(null);
  const [pagesJson, setPagesJson] = useState<PagesJson | null>(null);
  const [appLoading, setAppLoading] = useState(false);
  const [appError, setAppError] = useState<string | null>(null);

  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [chatVisible, setChatVisible] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState(CHAT_PANEL_DEFAULT_WIDTH);
  const [chatResizing, setChatResizing] = useState(false);
  const chatTarget = useMemo(
    () => resolveChatTarget(location.pathname, selectedMode, appName),
    [location.pathname, selectedMode, appName],
  );

  useEffect(() => {
    try {
      const persistedWidth = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
      if (!persistedWidth) return;
      const parsedWidth = Number(persistedWidth);
      if (!Number.isFinite(parsedWidth)) return;
      setChatPanelWidth(clampChatPanelWidth(parsedWidth));
    } catch {
      // Ignore localStorage access failures and keep the default width.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAT_PANEL_WIDTH_STORAGE_KEY, String(chatPanelWidth));
    } catch {
      // Ignore localStorage access failures; resizing still works in-memory.
    }
  }, [chatPanelWidth]);

  const handleDesktopChatResizeStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    setChatResizing(true);

    const updateWidth = (clientX: number) => {
      setChatPanelWidth(clampChatPanelWidth(window.innerWidth - clientX));
    };

    const onPointerMove = (moveEvent: globalThis.PointerEvent) => {
      updateWidth(moveEvent.clientX);
    };

    const stopResize = () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      setChatResizing(false);
    };

    updateWidth(event.clientX);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
  };

  const refreshApps = async () => {
    setAppsLoading(true);
    setAppsError(null);

    try {
      const response = await fetch('/api/v1/apps');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setApps(Array.isArray(json.data) ? (json.data as AppSummary[]) : []);
    } catch (err) {
      setAppsError(err instanceof Error ? err.message : String(err));
    } finally {
      setAppsLoading(false);
    }
  };

  const refreshApp = async () => {
    if (!appName || !selectedMode) {
      setApp(null);
      setPagesJson(null);
      setAppError(null);
      setAppLoading(false);
      return;
    }

    setAppLoading(true);
    setAppError(null);

    try {
      const data = await loadAppLayoutData(appName, selectedMode);
      setApp(data.app);
      setPagesJson(data.pagesJson);
    } catch (err) {
      setAppError(err instanceof Error ? err.message : String(err));
      setApp(null);
      setPagesJson(null);
    } finally {
      setAppLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedMode) return;
    void refreshApps();
  }, [selectedMode]);

  useEffect(() => {
    if (!selectedMode) return;
    void refreshApp();
  }, [appName, selectedMode]);

  useEffect(() => {
    setSidebarDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!sidebarVisible) {
      setSidebarDrawerOpen(false);
    }
  }, [sidebarVisible]);

  useEffect(() => {
    const { setActiveSession } = useChatStore.getState();
    setActiveSession(chatTarget);
    return () => {
      useChatStore.getState().setActiveSession(null);
    };
  }, [chatTarget]);

  useEffect(() => {
    if (chatTarget?.kind !== 'builder') {
      useChatStore.getState().setOnReconciled(null);
      return;
    }
    useChatStore.getState().setOnReconciled(() => {
      void refreshApp();
    });
    return () => {
      useChatStore.getState().setOnReconciled(null);
    };
  }, [chatTarget, appName]);

  useEffect(() => {
    if (!chatTarget) {
      setChatVisible(false);
    }
  }, [chatTarget]);

  if (!selectedMode) {
    return <Navigate to="/stable" replace />;
  }

  const ctxValue: AppContextValue = {
    mode: selectedMode,
    apps,
    appsLoading,
    appsError,
    appName,
    app,
    pagesJson,
    appLoading,
    appError,
    refreshApps,
    refreshApp,
    openSidebar: () => setSidebarDrawerOpen(true),
    toggleSidebar: () => {
      if (window.matchMedia('(max-width: 767px)').matches) {
        if (!sidebarVisible) setSidebarVisible(true);
        setSidebarDrawerOpen((open) => !open);
        return;
      }

      setSidebarVisible((visible) => !visible);
    },
    sidebarVisible,
  };

  return (
    <AppContext.Provider value={ctxValue}>
      <div className="h-screen overflow-hidden bg-[#F3F5F9] text-[#18181B]">
        <div className="flex h-full w-full overflow-hidden">
          <aside
            className={clsx(
              'hidden h-full shrink-0 border-r border-[#E7EBF2] bg-white transition-[width] duration-200 md:flex',
              sidebarVisible ? 'md:w-[240px]' : 'md:w-[72px]',
            )}
          >
            <AppSidebar collapsed={!sidebarVisible} />
          </aside>

          <section className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
          </section>

          {chatVisible && chatTarget && (
            <aside
              className="relative hidden h-full shrink-0 border-l border-[#E7EBF2] bg-white xl:flex"
              style={{ width: chatPanelWidth }}
            >
              <div
                role="separator"
                aria-label="Resize chat panel"
                aria-orientation="vertical"
                onPointerDown={handleDesktopChatResizeStart}
                className={clsx(
                  'absolute left-0 top-0 z-10 h-full w-1 -translate-x-1/2 cursor-col-resize touch-none transition-colors',
                  chatResizing ? 'bg-[#CBD5E1]/70' : 'bg-transparent hover:bg-[#CBD5E1]/60',
                )}
              />
              <ChatPanel
                kind={chatTarget.kind}
                appName={'appName' in chatTarget ? chatTarget.appName : undefined}
                dismissible
                onClose={() => setChatVisible(false)}
              />
            </aside>
          )}
        </div>
      </div>

      {!chatVisible && chatTarget && (
        <button
          type="button"
          aria-label="Open chat"
          onClick={() => setChatVisible(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#111827] text-white shadow-lg transition-colors hover:bg-[#0B1220]"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {sidebarDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#00000066]"
            aria-label="Close sidebar"
            onClick={() => setSidebarDrawerOpen(false)}
          />
          <aside className="relative h-full w-[240px] max-w-[88vw] overflow-hidden border-r border-[#E7EBF2] bg-white">
            <AppSidebar collapsed={false} />
          </aside>
        </div>
      )}

      {chatVisible && chatTarget && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#00000066]"
            aria-label="Close chat"
            onClick={() => setChatVisible(false)}
          />
          <aside className="absolute right-0 h-full w-[380px] max-w-[94vw] border-l border-[#E7EBF2] bg-white">
            <ChatPanel
              kind={chatTarget.kind}
              appName={'appName' in chatTarget ? chatTarget.appName : undefined}
              dismissible
              onClose={() => setChatVisible(false)}
            />
          </aside>
        </div>
      )}
    </AppContext.Provider>
  );
}
