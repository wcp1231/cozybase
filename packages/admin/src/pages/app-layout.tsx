import { useEffect, useState, createContext, useContext } from 'react';
import {
  useParams,
  Outlet,
  Link,
  NavLink,
} from 'react-router-dom';
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
      <div style={{ padding: 48, textAlign: 'center', color: '#6b7280' }}>
        Loading...
      </div>
    );
  }

  if (error || !app || !pagesJson) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: '#dc2626' }}>
        Error: {error || 'Unknown error'}
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ app, pagesJson }}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        {/* Top bar */}
        <div
          style={{
            height: 48,
            background: '#fff',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            flexShrink: 0,
          }}
        >
          <Link
            to="/apps"
            style={{
              color: '#2563EB',
              textDecoration: 'none',
              fontSize: 14,
              marginRight: 12,
            }}
          >
            &larr; Back to apps
          </Link>
          <span
            style={{
              color: '#d1d5db',
              marginRight: 12,
            }}
          >
            /
          </span>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#111827' }}>
            {app.name}
          </span>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1 }}>
          {/* Sidebar */}
          <div
            style={{
              width: 240,
              background: '#f9fafb',
              borderRight: '1px solid #e5e7eb',
              padding: '12px 0',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                padding: '8px 16px',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#9ca3af',
                letterSpacing: '0.05em',
              }}
            >
              Pages
            </div>
            {pagesJson.pages.map((page) => (
              <NavLink
                key={page.id}
                to={`/apps/${appName}/${page.id}`}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '8px 16px',
                  fontSize: 14,
                  color: isActive ? '#2563EB' : '#374151',
                  background: isActive ? '#eff6ff' : 'transparent',
                  textDecoration: 'none',
                  borderRight: isActive ? '2px solid #2563EB' : '2px solid transparent',
                })}
              >
                {page.title}
              </NavLink>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, background: '#fff', padding: 24 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </AppContext.Provider>
  );
}
