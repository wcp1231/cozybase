/**
 * Agent Working Directory Management
 *
 * Handles file I/O between the Agent's local working directory
 * and the cozybase backend (via AppSnapshot / FileEntry).
 */

import { join, dirname, resolve } from 'path';
import {
  existsSync,
  mkdirSync,
  rmSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  statSync,
} from 'fs';

import type { FileEntry } from './types';

const MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * Validate that a file path does not escape the app directory via
 * directory traversal (e.g., `../../etc/passwd`).
 * Throws if the resolved path is outside appDir.
 */
export function assertSafePath(appDir: string, filePath: string): string {
  const resolved = resolve(appDir, filePath);
  const normalizedAppDir = resolve(appDir);
  if (!resolved.startsWith(normalizedAppDir + '/') && resolved !== normalizedAppDir) {
    throw new Error(
      `Path traversal detected: '${filePath}' resolves outside the app directory.`,
    );
  }
  return resolved;
}

/**
 * Write files from an AppSnapshot to the Agent working directory.
 * Creates subdirectories as needed.
 */
export function writeAppToDir(
  appsDir: string,
  appName: string,
  files: FileEntry[],
): void {
  const appDir = join(appsDir, appName);
  mkdirSync(appDir, { recursive: true });

  for (const file of files) {
    const filePath = assertSafePath(appDir, file.path);
    const dir = dirname(filePath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, file.content, 'utf-8');
  }
}

/**
 * Clear an APP's working directory (remove all contents).
 * Used by fetch_app to avoid stale files before writing fresh content.
 */
export function clearAppDir(appsDir: string, appName: string): void {
  const appDir = join(appsDir, appName);
  if (existsSync(appDir)) {
    rmSync(appDir, { recursive: true, force: true });
  }
}

/**
 * Scan an APP's working directory and collect all files (path + content).
 * Skips hidden files/directories and files over 1MB.
 *
 * Returns file entries with paths relative to the app directory.
 */
export function collectAppFromDir(
  appsDir: string,
  appName: string,
): FileEntry[] {
  const appDir = join(appsDir, appName);
  if (!existsSync(appDir)) {
    return [];
  }
  return collectFiles(appDir, '');
}

/**
 * Get the absolute path to an APP's working directory.
 */
export function getAppDir(appsDir: string, appName: string): string {
  return join(appsDir, appName);
}

// --- Internal ---

function collectFiles(baseDir: string, prefix: string): FileEntry[] {
  const result: FileEntry[] = [];

  let entries;
  try {
    entries = readdirSync(baseDir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = join(baseDir, entry.name);

    if (entry.isDirectory()) {
      result.push(...collectFiles(fullPath, relativePath));
    } else if (entry.isFile()) {
      // Skip files over 1MB
      try {
        const stat = statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;
      } catch {
        continue;
      }
      const content = readFileSync(fullPath, 'utf-8');
      result.push({ path: relativePath, content });
    }
  }

  return result;
}
