/**
 * Workspace Init — copies template files to the target directory.
 *
 * Used by `cozybase init` to scaffold AGENT.md and Skills templates
 * into the Agent Workspace directory.
 */

import { resolve, join, relative } from 'path';
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync } from 'fs';

const TEMPLATES_DIR = resolve(import.meta.dir, '../templates/workspace');

interface InitResult {
  created: string[];
  skipped: string[];
}

/**
 * Initialize an Agent Workspace by copying template files.
 * Existing files are never overwritten.
 */
export function initWorkspace(targetDir: string): InitResult {
  const result: InitResult = { created: [], skipped: [] };

  if (!existsSync(TEMPLATES_DIR)) {
    throw new Error(`Template directory not found: ${TEMPLATES_DIR}`);
  }

  copyDir(TEMPLATES_DIR, targetDir, '', result);
  return result;
}

function copyDir(srcDir: string, destDir: string, prefix: string, result: InitResult): void {
  const entries = readdirSync(srcDir);

  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath, relPath, result);
    } else if (stat.isFile()) {
      if (existsSync(destPath)) {
        result.skipped.push(relPath);
      } else {
        mkdirSync(destDir, { recursive: true });
        writeFileSync(destPath, readFileSync(srcPath));
        result.created.push(relPath);
      }
    }
  }
}
