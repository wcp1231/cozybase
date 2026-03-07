import type { PlatformRepository } from './platform-repository';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';

const UI_FILE_PATH = 'ui/pages.json';
const FUNCTIONS_DIR_PREFIX = 'functions/';

export type FileUpdateKind = 'ui' | 'function' | 'rebuild' | 'other';

export interface FileUpdatePlan {
  kind: FileUpdateKind;
  needsRebuild: boolean;
}

export function classifyAppFileUpdate(path: string): FileUpdatePlan {
  if (path === UI_FILE_PATH) {
    return { kind: 'ui', needsRebuild: false };
  }
  if (path.startsWith(FUNCTIONS_DIR_PREFIX)) {
    return { kind: 'function', needsRebuild: false };
  }
  if (
    path.startsWith('migrations/')
    || path.startsWith('seeds/')
    || path === 'package.json'
    || path === 'app.yaml'
  ) {
    return { kind: 'rebuild', needsRebuild: true };
  }
  return { kind: 'other', needsRebuild: false };
}

export function exportUiFile(
  targetDir: string,
  content: string,
): string {
  const uiDir = join(targetDir, 'ui');
  const uiFilePath = join(uiDir, 'pages.json');
  mkdirSync(uiDir, { recursive: true });
  writeFileSync(uiFilePath, content, 'utf-8');
  return uiFilePath;
}

export function exportSingleFunction(
  targetDir: string,
  relativePath: string,
  content: string,
): string {
  return writeFunctionFile(join(targetDir, 'functions'), relativePath, content);
}

function writeFunctionFile(
  functionsDir: string,
  relativePath: string,
  content: string,
): string {
  if (!relativePath.startsWith(FUNCTIONS_DIR_PREFIX)) {
    throw new Error(`Function path must start with "${FUNCTIONS_DIR_PREFIX}"`);
  }

  const filename = relativePath.slice(FUNCTIONS_DIR_PREFIX.length);
  const resolvedFunctionsDir = resolve(functionsDir);
  const dest = resolve(functionsDir, filename);
  if (!dest.startsWith(resolvedFunctionsDir + '/')) {
    throw new Error(`Unsafe function export path: ${relativePath}`);
  }

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content, 'utf-8');
  return dest;
}

/**
 * Export ui/pages.json from Platform DB to a target directory.
 * Used by both DraftRebuilder (→ draft dir) and Publisher (→ stable dir).
 * Returns true if exported, false if no UI file found.
 */
export function exportUiFromDb(
  platformRepo: PlatformRepository,
  appName: string,
  targetDir: string,
): boolean {
  const record = platformRepo.appFiles.findByAppAndPath(appName, UI_FILE_PATH);

  const uiFilePath = join(targetDir, 'ui', 'pages.json');

  if (!record) {
    // Clean up stale file if it exists (DB is source of truth)
    if (existsSync(uiFilePath)) {
      rmSync(uiFilePath, { force: true });
    }
    return false;
  }

  exportUiFile(targetDir, record.content);
  return true;
}

/**
 * Export function files from Platform DB to a target directory.
 * Used by both DraftRebuilder (→ draft dir) and Publisher (→ stable dir).
 */
export function exportFunctionsFromDb(
  platformRepo: PlatformRepository,
  appName: string,
  targetDir: string,
): string[] {
  // Clean target directory
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  // Query function files
  const records = platformRepo.appFiles.findByAppAndPattern(appName, 'functions/%');

  if (records.length === 0) return [];

  mkdirSync(targetDir, { recursive: true });
  const exported: string[] = [];
  const resolvedTargetDir = resolve(targetDir);

  for (const record of records) {
    const filename = record.path.replace(FUNCTIONS_DIR_PREFIX, '');
    const dest = resolve(targetDir, filename);
    if (!dest.startsWith(resolvedTargetDir + '/')) {
      console.warn(`[file-export] Skipping unsafe path: ${record.path}`);
      continue;
    }
    writeFunctionFile(targetDir, record.path, record.content);
    exported.push(filename);
  }

  return exported;
}
