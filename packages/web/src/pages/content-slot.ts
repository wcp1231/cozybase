import type { PageSchema, PagesJson } from '@cozybase/ui';

export type AppMode = 'stable' | 'draft';

export type ContentSlotState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'no-ui'; message: string }
  | { type: 'not-found'; message: string }
  | { type: 'redirect'; to: string }
  | { type: 'render'; page: PageSchema; baseUrl: string };

export interface ResolveContentSlotInput {
  appName?: string;
  pageId?: string;
  mode: AppMode;
  pagesJson: PagesJson | null;
  appLoading: boolean;
  appError: string | null;
}

export function isAppMode(value: string | undefined): value is AppMode {
  return value === 'stable' || value === 'draft';
}

export function toModeHomePath(mode: AppMode): string {
  return `/${mode}`;
}

export function toAppListPath(mode: AppMode): string {
  return `/${mode}/apps`;
}

export function toSettingsPath(mode: AppMode): string {
  return `/${mode}/settings`;
}

export function toAppPagePath(appName: string, pageId: string | undefined, mode: AppMode): string {
  const path = `${toAppListPath(mode)}/${appName}`;
  return pageId ? `${path}/${pageId}` : path;
}

export function resolveContentSlotState(
  input: ResolveContentSlotInput,
): ContentSlotState {
  const { appName, pageId, mode, pagesJson, appLoading, appError } = input;

  if (!appName) {
    return { type: 'error', message: 'Missing app name.' };
  }

  if (appLoading) {
    return { type: 'loading' };
  }

  if (appError) {
    return { type: 'error', message: appError };
  }

  const pages = pagesJson?.pages ?? [];
  if (pages.length === 0) {
    return { type: 'no-ui', message: '该 App 暂无 UI 界面。' };
  }

  if (!pageId) {
    return { type: 'redirect', to: toAppPagePath(appName, pages[0].id, mode) };
  }

  const page = pages.find((item) => item.id === pageId);
  if (!page) {
    return { type: 'not-found', message: '页面不存在。' };
  }

  return {
    type: 'render',
    page,
    baseUrl: `/${mode}/apps/${appName}`,
  };
}
