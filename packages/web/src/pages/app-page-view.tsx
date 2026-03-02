import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { SchemaRenderer } from '@cozybase/ui';
import { useAppContext } from './app-layout';
import { isAppMode, type AppMode } from './content-slot';
import { BridgeClient } from '../lib/bridge-client';
import { inspectPage } from '../lib/ui-inspector';

export function AppPageView() {
  const { appName, '*': subPath, mode: modeParam } = useParams<{ appName: string; '*': string; mode: string }>();
  const { appLoading, appError, pagesJson } = useAppContext();
  const mode: AppMode = isAppMode(modeParam) ? modeParam : 'stable';
  const nav = useNavigate();
  const location = useLocation();

  // Keep a ref so the bridge handler always reads the latest subPath
  const subPathRef = useRef(subPath);
  subPathRef.current = subPath;

  const params = useMemo(
    () => Object.fromEntries(new URLSearchParams(location.search)),
    [location.search],
  );

  const baseUrl = `/${mode}/apps/${appName}`;

  const navigate = useCallback(
    (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        window.location.href = url;
        return;
      }
      nav(url);
    },
    [nav],
  );

  // --- Agent UI inspector bridge (draft mode only) ---
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
          nav(`/${mode}/apps/${appName}/${targetPage}`);
          // Wait for React to re-render the new page
          await new Promise((r) => setTimeout(r, 150));
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
  }, [mode, appName, nav]);

  // Loading state
  if (appLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (appError) {
    return <div className="p-6 text-[#DC2626]">Error: {appError}</div>;
  }

  // No UI pages
  if (!pagesJson || pagesJson.pages.length === 0) {
    return <div className="p-6 text-[#6B7280]">该 App 暂无 UI 界面。</div>;
  }

  // Redirect to first page when no sub-path (so sidebar NavLink highlights correctly)
  if (!subPath && appName) {
    const firstPageId = pagesJson.pages[0].id;
    return <Navigate to={`${baseUrl}/${firstPageId}`} replace />;
  }

  const page = pagesJson.pages.find((p) => p.id === subPath);

  if (!page) {
    return <div className="p-6 text-[#6B7280]">页面不存在。</div>;
  }

  return (
    <div id="cz-app-content" className="h-full w-full overflow-auto p-4">
      <SchemaRenderer
        schema={page}
        baseUrl={baseUrl}
        components={pagesJson.components}
        params={params}
        navigate={navigate}
      />
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#F3F5F9]">
      <div className="w-full max-w-2xl space-y-4 px-8">
        <div className="h-8 w-48 animate-pulse rounded bg-[#E2E8F0]" />
        <div className="h-4 w-96 animate-pulse rounded bg-[#E2E8F0]" />
        <div className="h-64 w-full animate-pulse rounded bg-[#E2E8F0]" />
      </div>
    </div>
  );
}
