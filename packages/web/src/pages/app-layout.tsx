import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import type { PagesJson } from '@cozybase/ui';
import { MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { AppSidebar } from '../features/shell/app-sidebar';
import { ChatPanel } from '../features/shell/chat-panel';
import { isAppMode, type AppMode } from './content-slot';
import type { AppInfo, AppSummary } from '../features/apps/types';

interface AppContextValue {
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

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppLayout');
  return ctx;
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
      const [appResponse, uiResponse] = await Promise.all([
        fetch(`/api/v1/apps/${appName}`),
        fetch(`/${selectedMode}/apps/${appName}/ui`),
      ]);

      if (!appResponse.ok) {
        throw new Error(`Failed to load app: HTTP ${appResponse.status}`);
      }

      const appJson = await appResponse.json();
      const appData = appJson.data;

      setApp({
        name: appData.name,
        description: appData.description,
        stableStatus: appData.stableStatus,
        hasDraft: appData.hasDraft,
        current_version: appData.current_version,
        published_version: appData.published_version,
      });

      if (uiResponse.status === 404) {
        setPagesJson(null);
      } else if (!uiResponse.ok) {
        throw new Error(`Failed to load UI: HTTP ${uiResponse.status}`);
      } else {
        const uiJson = await uiResponse.json();
        setPagesJson(uiJson ? (uiJson.data as PagesJson) : null);
      }
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

          {chatVisible && (
            <aside className="hidden h-full shrink-0 border-l border-[#E7EBF2] bg-white xl:flex xl:w-[380px]">
              <ChatPanel
                mode={selectedMode}
                appName={appName}
                dismissible
                onClose={() => setChatVisible(false)}
              />
            </aside>
          )}
        </div>
      </div>

      {!chatVisible && (
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

      {chatVisible && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#00000066]"
            aria-label="Close chat"
            onClick={() => setChatVisible(false)}
          />
          <aside className="absolute right-0 h-full w-[380px] max-w-[94vw] border-l border-[#E7EBF2] bg-white">
            <ChatPanel
              mode={selectedMode}
              appName={appName}
              dismissible
              onClose={() => setChatVisible(false)}
            />
          </aside>
        </div>
      )}
    </AppContext.Provider>
  );
}
