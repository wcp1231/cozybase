import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { SchemaRenderer } from '@cozybase/ui';
import { ActivitySquare, Loader2, Menu, Play, Rocket, Square } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppContext } from './app-layout';
import {
  getDefaultPagePath,
  getTopLevelPages,
  isAppMode,
  normalizeSubPath,
  resolveContentSlotState,
  toAppConsolePath,
  toAppPagePath,
  type AppMode,
} from './content-slot';
import { BridgeClient } from '../lib/bridge-client';
import { inspectPage } from '../lib/ui-inspector';
import { AppSectionHeader } from '../features/apps/app-section-header';

export function AppPageView() {
  const { appName, '*': subPath, mode: modeParam } = useParams<{ appName: string; '*': string; mode: string }>();
  const { app, appLoading, appError, pagesJson, refreshApp, refreshApps, toggleSidebar, sidebarVisible } = useAppContext();
  const mode: AppMode = isAppMode(modeParam) ? modeParam : 'stable';
  const navigate = useNavigate();
  const location = useLocation();
  const [busyAction, setBusyAction] = useState<'publish' | 'start' | 'stop' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pagePanelOpen, setPagePanelOpen] = useState(false);

  const subPathRef = useRef(subPath);
  subPathRef.current = subPath;

  const params = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search],
  );

  const bridgeRef = useRef<BridgeClient | null>(null);
  if (!bridgeRef.current) {
    bridgeRef.current = new BridgeClient();
  }

  useEffect(() => {
    if (mode !== 'draft') return;
    const bridge = bridgeRef.current!;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/agent/ws`);
    ws.addEventListener('open', () => bridge.setWebSocket(ws));
    ws.addEventListener('close', () => bridge.setWebSocket(null));

    bridge.setHandler(async (method, reqParams) => {
      if (method === 'inspect') {
        const targetPage = typeof reqParams.page === 'string' ? reqParams.page : undefined;
        if (targetPage && targetPage !== subPathRef.current) {
          navigate(`/${mode}/apps/${appName}/${targetPage}`);
          await new Promise((resolve) => setTimeout(resolve, 150));
        }

        const root = document.getElementById('cz-app-content');
        if (!root) throw new Error('App content not mounted');
        return inspectPage(root, subPathRef.current || 'default');
      }

      throw new Error(`Unknown method: ${method}`);
    });

    return () => {
      bridge.setHandler(null);
      bridge.setWebSocket(null);
      ws.close();
    };
  }, [mode, appName, navigate]);

  const slotState = resolveContentSlotState({
    appName,
    subPath,
    mode,
    pagesJson,
    appLoading,
    appError,
  });

  const topLevelPages = useMemo(
    () => getTopLevelPages(pagesJson?.pages ?? []),
    [pagesJson?.pages],
  );
  const fallbackSubPath = getDefaultPagePath(pagesJson?.pages ?? []);
  const appHomeTo = fallbackSubPath ? toAppPagePath(appName ?? '', fallbackSubPath, mode) : undefined;
  const currentSubPath = slotState.type === 'render'
    ? slotState.match.subPath
    : normalizeSubPath(subPath) ?? fallbackSubPath;
  const currentPagePath = slotState.type === 'render'
    ? slotState.match.pagePath
    : fallbackSubPath;
  const breadcrumbs = slotState.type === 'render' && slotState.match.breadcrumbs.length > 1
    ? slotState.match.breadcrumbs.map((item, index, list) => ({
      label: item.label,
      to: index < list.length - 1 ? toAppPagePath(appName ?? '', item.subPath, mode) : undefined,
    }))
    : undefined;
  const childTabs = slotState.type === 'render' ? slotState.match.childTabs : [];

  const goToUrl = useCallback(
    (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.location.href = url;
        return;
      }
      navigate(url);
    },
    [navigate],
  );

  const handlePublish = async () => {
    if (!appName) return;

    setBusyAction('publish');
    setActionError(null);

    try {
      const response = await fetch(`/draft/apps/${appName}/publish`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await Promise.all([refreshApp(), refreshApps()]);
      navigate(toAppPagePath(appName, currentSubPath, 'stable'));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleStable = async () => {
    if (!appName || !app?.stableStatus) return;

    const nextAction = app.stableStatus === 'running' ? 'stop' : 'start';
    setBusyAction(nextAction);
    setActionError(null);

    try {
      const response = await fetch(`/api/v1/apps/${appName}/${nextAction}`, { method: 'POST' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      await Promise.all([refreshApp(), refreshApps()]);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (slotState.type === 'redirect') {
    return <Navigate to={slotState.to} replace />;
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <AppSectionHeader
        mode={mode}
        appName={appName}
        appDisplayName={app?.displayName}
        appHomeTo={appHomeTo}
        stableStatus={app?.stableStatus ?? null}
        breadcrumbs={breadcrumbs}
        toggleSidebar={toggleSidebar}
        sidebarVisible={sidebarVisible}
        actions={
          mode === 'draft' ? (
            <>
              <Link
                to={toAppConsolePath(appName ?? '', mode)}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] no-underline transition-colors hover:bg-[#F8FAFC]"
              >
                <ActivitySquare className="h-4 w-4" />
                控制台
              </Link>
              <button
                type="button"
                onClick={handlePublish}
                disabled={busyAction !== null}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#4F46E5] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyAction === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                发布
              </button>
            </>
          ) : app?.stableStatus ? (
            <button
              type="button"
              onClick={handleToggleStable}
              disabled={busyAction !== null}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#E2E8F0] bg-white px-4 text-sm font-semibold text-[#334155] transition-colors hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : app.stableStatus === 'running' ? (
                <Square className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {app.stableStatus === 'running' ? '停止' : '启动'}
            </button>
          ) : null
        }
      />

      <main className="min-h-0 flex-1 overflow-auto">
        {actionError && (
          <div className="mx-4 mb-4 mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-sm text-[#B91C1C] md:mx-8">
            {actionError}
          </div>
        )}

        {slotState.type === 'loading' ? (
          <LoadingSkeleton />
        ) : slotState.type === 'error' || slotState.type === 'no-ui' || slotState.type === 'not-found' ? (
          <EmptyState message={slotState.message} />
        ) : (
          <div className="min-h-full overflow-hidden bg-[#F8FAFC]">
            {topLevelPages.length > 1 ? (
              <div className="flex h-11 items-end gap-1 border-b border-[#E7EBF2] bg-white px-4 md:px-8">
                {topLevelPages.map((page) => (
                  <Link
                    key={page.path}
                    to={toAppPagePath(appName ?? '', page.path, mode)}
                    className={clsx(
                      'inline-flex h-full items-center border-b-2 px-3 text-[13px] no-underline transition-colors',
                      page.path === currentPagePath
                        ? 'border-[#4F46E5] font-semibold text-[#4F46E5]'
                        : 'border-transparent font-medium text-[#94A3B8] hover:text-[#475569]',
                    )}
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            ) : null}

            {childTabs.length > 0 ? (
              <div className="flex min-h-10 items-center gap-2 border-b border-[#E7EBF2] bg-[#FCFDFE] px-4 py-2 md:px-8">
                {childTabs.map((page) => (
                  <Link
                    key={page.pagePath}
                    to={toAppPagePath(appName ?? '', page.subPath, mode)}
                    className={clsx(
                      'inline-flex h-7 items-center rounded-full px-3 text-xs font-medium no-underline transition-colors',
                      page.active
                        ? 'bg-[#EEF2FF] text-[#4F46E5]'
                        : 'bg-[#F8FAFC] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#334155]',
                    )}
                  >
                    {page.label}
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="flex min-h-[620px] bg-white">
              {mode === 'draft' && pagePanelOpen && pagesJson?.pages.length ? (
                <aside className="w-[210px] shrink-0 border-r border-[#E7EBF2] bg-white shadow-[4px_0_16px_rgba(0,0,0,0.10)]">
                  <div className="flex h-10 items-center justify-between px-3.5">
                    <span className="text-xs font-bold text-[#64748B]">页面</span>
                  </div>
                  <div className="flex flex-col gap-0.5 px-2 pb-2">
                    {pagesJson.pages.map((page, index) => (
                      <Link
                        key={page.path}
                        to={toAppPagePath(appName ?? '', page.path, mode)}
                        className={clsx(
                          'flex h-8 items-center gap-2 rounded-[6px] px-2.5 text-xs no-underline transition-colors',
                          page.path === currentPagePath
                            ? 'bg-[#EEF2FF] font-semibold text-[#4F46E5]'
                            : 'font-medium text-[#475569] hover:bg-[#F8FAFC]',
                        )}
                      >
                        <span
                          className={clsx(
                            'inline-flex h-[15px] w-[15px] items-center justify-center rounded text-[10px]',
                            page.path === currentPagePath ? 'bg-[#E0E7FF] text-[#4F46E5]' : 'bg-[#F1F5F9] text-[#64748B]',
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="truncate">{page.title}</span>
                      </Link>
                    ))}
                  </div>
                </aside>
              ) : null}

              <div
                id="cz-app-content"
                className={clsx(
                  'cz-app-canvas min-h-[620px] flex-1 overflow-auto bg-[#F8FAFC] px-4 py-5 md:px-7 md:py-7',
                  mode === 'draft' && 'cz-app-canvas--draft',
                )}
              >
                <SchemaRenderer
                  schema={slotState.match.page}
                  baseUrl={slotState.baseUrl}
                  currentPath={slotState.currentPath}
                  components={pagesJson?.components ?? {}}
                  params={slotState.type === 'render' ? { ...params, ...slotState.match.params } : params}
                  navigate={goToUrl}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {mode === 'draft' && pagesJson?.pages.length ? (
        <button
          type="button"
          onClick={() => setPagePanelOpen((open) => !open)}
          aria-label="Toggle pages panel"
          className="fixed bottom-0 left-4 z-30 inline-flex h-8 items-center gap-2 border border-[#D8DEE8] bg-white px-3.5 text-xs font-semibold text-[#475569] shadow-[0_12px_24px_-16px_rgba(15,23,42,0.45)] transition-colors hover:bg-[#F8FAFC] md:left-60"
        >
          <Menu className="h-4 w-4" />
          <span>{pagePanelOpen ? '隐藏页面层级' : '页面层级'}</span>
        </button>
      ) : null}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4 rounded-[18px] bg-white p-6">
      <div className="h-7 w-40 animate-pulse rounded bg-[#E2E8F0]" />
      <div className="h-4 w-80 animate-pulse rounded bg-[#E2E8F0]" />
      <div className="h-64 w-full animate-pulse rounded-2xl bg-[#E2E8F0]" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-[480px] items-center justify-center rounded-[18px] border border-dashed border-[#D7DEEA] bg-white px-6 text-center">
      <div>
        <div className='font-["Outfit",sans-serif] text-xl font-bold text-[#18181B]'>当前还没有可渲染内容</div>
        <div className="mt-2 max-w-md text-sm leading-6 text-[#64748B]">{message}</div>
      </div>
    </div>
  );
}
