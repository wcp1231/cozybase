import { useEffect, useState, createContext, useContext } from 'react';
import {
  useParams,
  Outlet,
  Link,
  NavLink,
} from 'react-router-dom';
import { clsx } from 'clsx';
import type { PagesJson } from '@cozybase/ui';

interface AppInfo {
  name: string;
  description: string;
  current_version: number;
  published_version: number;
  state: string;
}

interface AppContextValue {
  app: AppInfo;
  pagesJson: PagesJson;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppLayout');
  return ctx;
}

export function AppLayout() {
  const { appName } = useParams<{ appName: string }>();
  const [app, setApp] = useState<AppInfo | null>(null);
  const [pagesJson, setPagesJson] = useState<PagesJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch app metadata and UI definition in parallel
    Promise.all([
      fetch(`/api/v1/apps/${appName}`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load app: HTTP ${res.status}`);
        return res.json();
      }),
      fetch(`/stable/apps/${appName}/ui`).then((res) => {
        if (res.status === 404) {
          return null; // UI not published yet
        }
        if (!res.ok) throw new Error('加载 UI 定义失败');
        return res.json();
      }),
    ])
      .then(([appJson, uiJson]) => {
        const appData = appJson.data;
        setApp({
          name: appData.name,
          description: appData.description,
          current_version: appData.current_version,
          published_version: appData.published_version,
          state: appData.state,
        });

        if (!uiJson) {
          throw new Error('该 App 的 UI 尚未发布，请先执行 reconcile 和 publish');
        }

        setPagesJson(uiJson.data as PagesJson);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [appName]);

  if (loading) {
    return (
      <div className="p-12 text-center text-text-muted">
        Loading...
      </div>
    );
  }

  if (error || !app || !pagesJson) {
    return (
      <div className="p-12 text-center text-danger">
        Error: {error || 'Unknown error'}
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ app, pagesJson }}>
      <div className="flex flex-col min-h-screen">
        {/* Top bar */}
        <div className="h-12 bg-bg border-b border-border flex items-center px-4 shrink-0">
          <Link
            to="/apps"
            className="text-primary no-underline text-sm mr-3"
          >
            &larr; Back to apps
          </Link>
          <span className="text-border mr-3">/</span>
          <span className="font-semibold text-sm text-text">
            {app.name}
          </span>
        </div>

        {/* Body */}
        <div className="flex flex-1">
          {/* Sidebar */}
          <div className="w-60 bg-bg-subtle border-r border-border py-3 shrink-0">
            <div className="px-4 py-2 text-[11px] font-semibold uppercase text-text-placeholder tracking-wide">
              Pages
            </div>
            {pagesJson.pages.map((page) => (
              <NavLink
                key={page.id}
                to={`/apps/${appName}/${page.id}`}
                className={({ isActive }) =>
                  clsx(
                    'block px-4 py-2 text-sm no-underline border-r-2',
                    isActive
                      ? 'text-primary bg-info-bg border-primary'
                      : 'text-text-secondary bg-transparent border-transparent',
                  )
                }
              >
                {page.title}
              </NavLink>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 bg-bg p-6">
            <Outlet />
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
}
