/**
 * Workspace Init — copies template files to the target directory.
 *
 * Used by `cozybase init` to scaffold AGENTS.md, .agents/skills and Claude-compatible links
 * into the Agent Workspace directory.
 */

import { resolve, join } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
} from 'fs';

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
  ensureClaudeDocSymlink(targetDir, result);
  ensureClaudeSkillsSymlink(targetDir, result);
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

function ensureClaudeDocSymlink(targetDir: string, result: InitResult): void {
  const agentsDocPath = join(targetDir, 'AGENTS.md');
  const claudeDocPath = join(targetDir, 'CLAUDE.md');

  if (!pathExists(agentsDocPath)) {
    return;
  }
  if (pathExists(claudeDocPath)) {
    result.skipped.push('CLAUDE.md');
    return;
  }

  symlinkSync('AGENTS.md', claudeDocPath);
  result.created.push('CLAUDE.md');
}

function ensureClaudeSkillsSymlink(targetDir: string, result: InitResult): void {
  const agentsSkillsRoot = join(targetDir, '.agents');
  const claudeSkillsRoot = join(targetDir, '.claude');

  if (!pathExists(agentsSkillsRoot)) {
    return;
  }
  if (pathExists(claudeSkillsRoot)) {
    result.skipped.push('.claude');
    return;
  }

  symlinkSync('.agents', claudeSkillsRoot);
  result.created.push('.claude');
}

function pathExists(path: string): boolean {
  if (existsSync(path)) {
    return true;
  }
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
