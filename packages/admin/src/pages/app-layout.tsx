import { createContext, useContext, useEffect, useState } from 'react';
import { useParams, Outlet, Link, NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { MessageCircle, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { PagesJson } from '@cozybase/ui';

interface AppSummary {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
  created_at: string;
  updated_at: string;
  state: string;
  has_ui: boolean;
}

interface AppInfo {
  name: string;
  description: string;
  current_version: number;
  published_version: number;
  state: string;
}

interface AppContextValue {
  apps: AppSummary[];
  appsLoading: boolean;
  appsError: string | null;
  appName?: string;
  app: AppInfo | null;
  pagesJson: PagesJson | null;
  appLoading: boolean;
  appError: string | null;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppLayout');
  return ctx;
}

export function AppLayout() {
  const { appName } = useParams<{ appName: string }>();

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
  const iconBtnClass =
    'inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#E2E8F0] bg-white text-[#475569] transition-colors hover:bg-[#F8FAFC]';

  const closeChatWindow = () => {
    setChatVisible(false);
  };

  const showChatWindow = () => setChatVisible(true);
  const toggleSidebar = () => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      if (sidebarDrawerOpen) {
        setSidebarDrawerOpen(false);
        return;
      }
      if (!sidebarVisible) setSidebarVisible(true);
      setSidebarDrawerOpen(true);
      return;
    }
    setSidebarVisible((visible) => !visible);
  };

  useEffect(() => {
    let cancelled = false;
    setAppsLoading(true);
    setAppsError(null);

    fetch('/api/v1/apps')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setApps(Array.isArray(json.data) ? (json.data as AppSummary[]) : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setAppsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (cancelled) return;
        setAppsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSidebarDrawerOpen(false);
  }, [appName]);

  useEffect(() => {
    if (!sidebarVisible) setSidebarDrawerOpen(false);
  }, [sidebarVisible]);

  useEffect(() => {
    if (!appName) {
      setApp(null);
      setPagesJson(null);
      setAppError(null);
      setAppLoading(false);
      return;
    }

    let cancelled = false;
    setAppLoading(true);
    setAppError(null);

    Promise.all([
      fetch(`/api/v1/apps/${appName}`).then((res) => {
        if (!res.ok) throw new Error(`Failed to load app: HTTP ${res.status}`);
        return res.json();
      }),
      fetch(`/stable/apps/${appName}/ui`).then((res) => {
        if (res.status === 404) return null;
        if (!res.ok) throw new Error('加载 UI 定义失败');
        return res.json();
      }),
    ])
      .then(([appJson, uiJson]) => {
        if (cancelled) return;

        const appData = appJson.data;
        setApp({
          name: appData.name,
          description: appData.description,
          current_version: appData.current_version,
          published_version: appData.published_version,
          state: appData.state,
        });

        setPagesJson(uiJson ? (uiJson.data as PagesJson) : null);
      })
      .catch((err) => {
        if (cancelled) return;
        setAppError(err instanceof Error ? err.message : String(err));
        setApp(null);
        setPagesJson(null);
      })
      .finally(() => {
        if (cancelled) return;
        setAppLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [appName]);

  const ctxValue: AppContextValue = {
    apps,
    appsLoading,
    appsError,
    appName,
    app,
    pagesJson,
    appLoading,
    appError,
  };

  return (
    <AppContext.Provider value={ctxValue}>
      <div className="min-h-screen bg-[#F3F5F9] text-[#18181B]">
        <div className="flex min-h-screen w-full">
          <aside
            className={clsx(
              'hidden shrink-0 border-r border-[#E7EBF2] bg-white transition-[width] duration-200 md:flex',
              sidebarVisible ? 'md:w-[240px]' : 'md:w-[72px]',
            )}
          >
            <SidebarContent collapsed={!sidebarVisible} />
          </aside>

          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-[76px] items-center gap-3 px-4 pb-2 pt-4 md:px-8">
              <button
                type="button"
                aria-label="切换侧栏"
                className={clsx(iconBtnClass, 'shrink-0')}
                onClick={toggleSidebar}
              >
                <PanelLeftOpen className="h-4 w-4 md:hidden" />
                <PanelLeftClose className={clsx('hidden h-4 w-4 md:block', !sidebarVisible && 'md:hidden')} />
                <PanelLeftOpen className={clsx('hidden h-4 w-4 md:block', sidebarVisible && 'md:hidden')} />
              </button>

              <div className="min-w-0 flex-1">
                <h1 className="m-0 truncate text-[26px] font-extrabold leading-tight tracking-[-0.01em]">
                  {appName ?? 'APP 列表'}
                </h1>
              </div>

              <div className="hidden items-center gap-2 md:flex">
                <div className="flex h-10 w-[320px] items-center rounded-[10px] border border-[#E2E8F0] bg-white px-3 text-xs text-[#A1A1AA]">
                  搜索应用...
                </div>
              </div>
            </header>

            <main className="min-h-0 flex-1 overflow-auto px-4 pb-4 pt-2 md:px-8 md:pb-8 md:pt-6">
              <Outlet />
            </main>
          </section>

          {chatVisible && (
            <aside className="hidden shrink-0 border-l border-[#E7EBF2] bg-white xl:flex xl:w-[380px]">
              <ChatPanel onClose={closeChatWindow} />
            </aside>
          )}
        </div>
      </div>

      {!chatVisible && (
        <button
          type="button"
          aria-label="打开聊天"
          className="fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#111827] text-white shadow-md transition-colors hover:bg-[#0B1220]"
          onClick={showChatWindow}
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {sidebarVisible && sidebarDrawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-overlay"
            onClick={() => setSidebarDrawerOpen(false)}
          />
          <aside className="relative h-full w-[240px] max-w-[86vw] overflow-auto border-r border-[#E7EBF2] bg-white">
            <SidebarContent collapsed={false} />
          </aside>
        </div>
      )}

      {chatVisible && (
        <div className="fixed inset-0 z-50 xl:hidden">
          <button
            type="button"
            aria-label="Close chat"
            className="absolute inset-0 bg-overlay"
            onClick={closeChatWindow}
          />
          <aside className="absolute right-0 h-full w-[380px] max-w-[94vw] border-l border-[#E7EBF2] bg-white">
            <ChatPanel onClose={closeChatWindow} />
          </aside>
        </div>
      )}
    </AppContext.Provider>
  );
}

function SidebarContent({
  collapsed,
}: {
  collapsed: boolean;
}) {
  const { appName, pagesJson, appLoading } = useAppContext();
  const navItemBase = clsx(
    'flex h-[42px] rounded-[10px] text-sm font-semibold no-underline transition-colors',
    collapsed ? 'items-center justify-center px-0' : 'items-center gap-3 px-3.5',
  );

  return (
    <div
      className={clsx(
        'flex h-full w-full flex-col gap-7 overflow-auto',
        collapsed ? 'items-center p-[20px_12px]' : 'p-[24px_18px]',
      )}
    >
      <div className={clsx('flex h-10 items-center gap-2', collapsed ? 'justify-center' : 'justify-between')}>
        <Link
          to="/apps"
          title="CozyBase"
          className={clsx(
            'flex items-center text-inherit no-underline',
            collapsed ? 'justify-center' : 'min-w-0 gap-2.5',
          )}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#18181B] text-sm font-extrabold text-white">
            C
          </span>
          {!collapsed && (
            <span className="truncate text-xl font-extrabold tracking-[-0.01em]">CozyBase</span>
          )}
        </Link>
      </div>

      <nav className={clsx('flex flex-col gap-1', collapsed && 'w-full')}>
        <div className={clsx(navItemBase, 'text-[#475569]')} title={collapsed ? '首页' : undefined}>
          <span className="h-[18px] w-[18px] rounded-full border border-[#CBD5E1]" />
          {!collapsed && <span>首页</span>}
        </div>
        <NavLink
          to="/apps"
          title={collapsed ? 'APP 列表' : undefined}
          end
          className={({ isActive }) =>
            clsx(
              navItemBase,
              isActive
                ? 'border border-[#DDE4FF] bg-[#EEF2FF] text-[#3730A3]'
                : 'border border-transparent bg-white text-[#475569] hover:bg-[#F8FAFC]',
            )
          }
        >
          <span className="h-[18px] w-[18px] rounded-md bg-[#C7D2FE]" />
          {!collapsed && <span>APP 列表</span>}
        </NavLink>
        <div className={clsx(navItemBase, 'text-[#475569]')} title={collapsed ? '设置' : undefined}>
          <span className="h-[18px] w-[18px] rounded-md border border-[#CBD5E1]" />
          {!collapsed && <span>设置</span>}
        </div>
      </nav>

      <div className={clsx('flex min-h-0 flex-1 flex-col gap-5', collapsed && 'w-full')}>
        {appName && (
          <section>
            {!collapsed && (
              <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                Pages
              </div>
            )}

            {appLoading && !collapsed && (
              <div className="px-1 py-2 text-sm text-[#64748B]">Loading pages...</div>
            )}

            {!appLoading && pagesJson?.pages.length ? (
              <nav className={clsx('flex flex-col gap-1', collapsed && 'items-center')}>
                {pagesJson.pages.map((page) => (
                  <NavLink
                    key={page.id}
                    to={`/apps/${appName}/${page.id}`}
                    title={collapsed ? page.title : undefined}
                    className={({ isActive }) =>
                      clsx(
                        'rounded-[10px] text-sm font-medium no-underline transition-colors',
                        isActive
                          ? 'border border-[#DDE4FF] bg-[#EEF2FF] text-[#3730A3]'
                          : 'text-[#475569] hover:bg-[#F8FAFC]',
                        collapsed
                          ? 'flex h-[38px] w-[38px] items-center justify-center px-0 py-0'
                          : 'block truncate px-3 py-2',
                      )
                    }
                  >
                    {collapsed ? (
                      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] bg-[#E2E8F0] text-[10px] font-semibold leading-none">
                        {(page.title || page.id).trim().charAt(0).toUpperCase()}
                      </span>
                    ) : (
                      page.title
                    )}
                  </NavLink>
                ))}
              </nav>
            ) : null}

            {!appLoading && !pagesJson?.pages.length && !collapsed && (
              <div className="px-1 py-2 text-sm text-[#64748B]">No UI pages</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ChatPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-[60px] items-center gap-2.5 border-b border-[#EEF2F7] px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#18181B] text-[10px] font-bold text-white">
            AI
          </span>
          <h2 className="m-0 text-base font-bold text-[#18181B]">AI 助手</h2>
        </div>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E2E8F0] bg-white text-base leading-none text-[#64748B] transition-colors hover:bg-[#F8FAFC]"
          aria-label="Close chat"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 bg-[#F8FAFC] p-5">
        <div className="flex gap-2.5">
          <span className="mt-1 h-7 w-7 rounded-full bg-[#18181B]" />
          <div className="max-w-[300px] rounded-[12px] rounded-tl-[2px] bg-[#F4F4F5] px-3.5 py-2.5 text-sm leading-relaxed text-[#27272A]">
            你好，我是 CozyBase AI 助手。需要我帮你创建或修改应用吗？
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[260px] rounded-[12px] rounded-tr-[2px] bg-[#18181B] px-3.5 py-2.5 text-sm leading-relaxed text-white">
            先帮我看一下现在有哪些应用。
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#71717A]">
            创建新应用
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#71717A]">
            修改应用
          </span>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-[#71717A]">
            使用帮助
          </span>
        </div>
      </div>

      <div className="border-t border-[#EEF2F7] px-5 pb-4 pt-3">
        <div className="flex items-center gap-3">
          <div className="flex h-[38px] min-w-0 flex-1 items-center rounded-full border border-[#E2E8F0] bg-white px-4 text-xs text-[#A1A1AA]">
            输入消息，与 AI 助手对话...
          </div>
          <button
            type="button"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#111827] text-sm font-bold text-white"
            aria-label="Send"
          >
            ^
          </button>
        </div>
      </div>
    </div>
  );
}
