import { matchPath, type PathMatch } from 'react-router-dom';
import { resolveExpression, type PageSchema, type PagesJson } from '@cozybase/ui';

export type AppMode = 'stable' | 'draft';

export interface BreadcrumbItem {
  label: string;
  subPath: string;
  pagePath: string;
}

export interface ChildTabItem {
  label: string;
  subPath: string;
  pagePath: string;
  active: boolean;
}

export interface MatchedPage {
  page: PageSchema;
  pagePath: string;
  subPath: string;
  params: Record<string, string>;
  breadcrumbs: BreadcrumbItem[];
  childTabs: ChildTabItem[];
}

export type ContentSlotState =
  | { type: 'loading' }
  | { type: 'error'; message: string }
  | { type: 'no-ui'; message: string }
  | { type: 'not-found'; message: string }
  | { type: 'redirect'; to: string }
  | { type: 'render'; match: MatchedPage; baseUrl: string; currentPath: string };

export interface ResolveContentSlotInput {
  appName?: string;
  subPath?: string;
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

export function toAppPagePath(appName: string, subPath: string | undefined, mode: AppMode): string {
  const path = `${toAppListPath(mode)}/${appName}`;
  return subPath ? `${path}/${normalizeSubPath(subPath)}` : path;
}

export function toAppConsolePath(appName: string, mode: AppMode): string {
  return `${toAppListPath(mode)}/${appName}/console`;
}

export function resolveContentSlotState(
  input: ResolveContentSlotInput,
): ContentSlotState {
  const { appName, subPath, mode, pagesJson, appLoading, appError } = input;

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

  const normalizedSubPath = normalizeSubPath(subPath);
  if (!normalizedSubPath) {
    return {
      type: 'redirect',
      to: toAppPagePath(appName, getDefaultPagePath(pages), mode),
    };
  }

  const match = matchPage(pages, normalizedSubPath);
  if (!match) {
    return { type: 'not-found', message: '页面不存在。' };
  }

  const matchTrail = buildMatchTrail(pages, normalizedSubPath);
  const currentMatch = matchTrail.at(-1) ?? match;

  return {
    type: 'render',
    match: {
      ...currentMatch,
      breadcrumbs: buildBreadcrumbs(matchTrail),
      childTabs: buildChildTabs(pages, matchTrail),
    },
    baseUrl: `/${mode}/apps/${appName}`,
    currentPath: toAppPagePath(appName, normalizedSubPath, mode),
  };
}

export function normalizeSubPath(subPath?: string): string | undefined {
  if (!subPath) return undefined;
  const normalized = subPath.replace(/^\/+|\/+$/g, '');
  return normalized || undefined;
}

export function getTopLevelPages(pages: PageSchema[]): PageSchema[] {
  return pages.filter((page) => !page.path.includes('/'));
}

export function getDefaultPagePath(pages: PageSchema[]): string | undefined {
  return getTopLevelPages(pages)[0]?.path ?? pages[0]?.path;
}

export function resolvePageTitle(page: PageSchema, params: Record<string, string>): string {
  const resolved = resolveExpression(page.title, { params });
  return resolved === undefined || resolved === null || resolved === ''
    ? page.title
    : String(resolved);
}

export function matchPage(pages: PageSchema[], subPath: string): MatchedPage | null {
  const pathname = `/${normalizeSubPath(subPath) ?? ''}`;
  for (const page of pages) {
    const match = matchPath({ path: `/${page.path}`, end: true }, pathname);
    if (match) {
      return buildMatchedPage(page, subPath, match);
    }
  }
  return null;
}

function buildMatchedPage(page: PageSchema, subPath: string, match: PathMatch<string>): MatchedPage {
  const params = Object.fromEntries(
    Object.entries(match.params).flatMap(([key, value]) => (
      value === undefined ? [] : [[key, value]]
    )),
  );

  return {
    page,
    pagePath: page.path,
    subPath,
    params,
    breadcrumbs: [],
    childTabs: [],
  };
}

function buildMatchTrail(pages: PageSchema[], subPath: string): MatchedPage[] {
  const segments = normalizeSubPath(subPath)?.split('/') ?? [];
  const trail: MatchedPage[] = [];

  for (let i = 0; i < segments.length; i++) {
    const prefix = segments.slice(0, i + 1).join('/');
    const match = matchPage(pages, prefix);
    if (!match) continue;

    trail.push(match);
  }

  return trail;
}

export function buildBreadcrumbs(matches: MatchedPage[]): BreadcrumbItem[] {
  return matches.map((match) => ({
    label: resolvePageTitle(match.page, match.params),
    subPath: match.subPath,
    pagePath: match.pagePath,
  }));
}

export function buildChildTabs(pages: PageSchema[], matchTrail: MatchedPage[]): ChildTabItem[] {
  const currentMatch = matchTrail.at(-1);
  if (!currentMatch) return [];

  for (const contextMatch of [...matchTrail].reverse()) {
    const directStaticChildren = pages.filter((page) =>
      isDirectStaticChildPath(contextMatch.pagePath, page.path),
    );

    if (directStaticChildren.length === 0) {
      continue;
    }

    const childTabs = directStaticChildren.flatMap((page) => {
      const subPath = materializePagePath(page.path, contextMatch.params);
      if (!subPath) return [];

      const match = matchPage(pages, subPath);
      if (!match) return [];

      return [{
        label: resolvePageTitle(match.page, match.params),
        subPath,
        pagePath: match.pagePath,
        active: isSameOrDescendantPath(match.pagePath, currentMatch.pagePath),
      }];
    });

    if (childTabs.length > 1) {
      return childTabs;
    }
  }

  return [];
}

function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function isParamSegment(segment: string): boolean {
  return segment.startsWith(':');
}

function isDirectStaticChildPath(parentPath: string, childPath: string): boolean {
  const parentSegments = splitPath(parentPath);
  const childSegments = splitPath(childPath);
  if (childSegments.length !== parentSegments.length + 1) {
    return false;
  }

  if (!parentSegments.every((segment, index) => childSegments[index] === segment)) {
    return false;
  }

  return !isParamSegment(childSegments[childSegments.length - 1]!);
}

function isSameOrDescendantPath(basePath: string, currentPath: string): boolean {
  const baseSegments = splitPath(basePath);
  const currentSegments = splitPath(currentPath);
  if (currentSegments.length < baseSegments.length) {
    return false;
  }

  return baseSegments.every((segment, index) => currentSegments[index] === segment);
}

function materializePagePath(path: string, params: Record<string, string>): string | null {
  const segments = splitPath(path).map((segment) => {
    if (!isParamSegment(segment)) {
      return segment;
    }

    return params[segment.slice(1)] ?? null;
  });

  return segments.every((segment) => segment !== null) ? segments.join('/') : null;
}
