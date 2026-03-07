/**
 * Workspace Init — copies template files to the target directory.
 *
 * Used by `cozybase init` to scaffold AGENTS.md, .agents/skills and Claude-compatible links
 * into the Agent Workspace directory.
 *
 * Template files are fully managed: on each init they are copied/overwritten,
 * and files removed from the template are deleted from the target via a manifest.
 */

import { resolve, join, dirname } from 'path';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  readFileSync,
  writeFileSync,
  symlinkSync,
  lstatSync,
  unlinkSync,
  rmdirSync,
  rmSync,
  realpathSync,
} from 'fs';
import { resolveWorkspaceTemplatesDir } from './runtime-paths';

const TEMPLATES_DIR = resolveWorkspaceTemplatesDir();
const MANIFEST_FILE = '.agents/.template-manifest.json';

export interface InitResult {
  created: string[];
  updated: string[];
  skipped: string[];
  removed: string[];
}

/**
 * Resolve the real (physical) path of targetDir.
 * targetDir itself may sit under a symlinked prefix (e.g. /tmp → /private/tmp on macOS),
 * so we resolve it once and use the real path for all boundary checks.
 */
function resolveRealTargetDir(targetDir: string): string {
  mkdirSync(targetDir, { recursive: true });
  return realpathSync(targetDir);
}

/**
 * Assert that a physical path is inside the real target directory.
 */
function isInsideTarget(realTarget: string, realPath: string): boolean {
  return realPath.startsWith(realTarget + '/') || realPath === realTarget;
}

/**
 * If the destination path exists and is not a regular file,
 * remove it so it can be replaced with a normal file from the template.
 */
function ensureRegularFileSlot(destPath: string): void {
  try {
    const st = lstatSync(destPath);
    if (!st.isFile()) {
      if (st.isDirectory()) {
        rmSync(destPath, { recursive: true, force: true });
      } else {
        unlinkSync(destPath);
      }
    }
  } catch {
    // doesn't exist — fine
  }
}

/**
 * Ensure a template-managed directory path is backed by a real directory.
 * If the slot is occupied by a file or symlink, remove it first.
 */
function ensureDirectorySlot(dirPath: string): void {
  try {
    const st = lstatSync(dirPath);
    if (st.isDirectory()) {
      return;
    }
    if (st.isSymbolicLink() || st.isFile()) {
      unlinkSync(dirPath);
      return;
    }
    rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // doesn't exist — fine
  }
}

/**
 * Initialize an Agent Workspace by copying template files.
 * Template-managed files are always overwritten to stay in sync.
 * Files removed from the template are cleaned up via a manifest.
 */
export function initWorkspace(targetDir: string): InitResult {
  const result: InitResult = { created: [], updated: [], skipped: [], removed: [] };

  if (!existsSync(TEMPLATES_DIR)) {
    throw new Error(`Template directory not found: ${TEMPLATES_DIR}`);
  }

  const realTarget = resolveRealTargetDir(targetDir);
  const oldManifest = loadManifest(targetDir);
  const newFiles = copyDir(TEMPLATES_DIR, targetDir, '', realTarget, result);

  // Pre-manifest workspaces cannot safely distinguish removed built-in skills
  // from user-created skills under .agents/skills, so we only start tracking
  // with the freshly generated manifest instead of deleting unknown files.
  const baseline = oldManifest.length > 0 ? oldManifest : bootstrapManifest(targetDir, newFiles);
  removeStaleFiles(targetDir, realTarget, baseline, newFiles, result);
  saveManifest(targetDir, newFiles);

  ensureClaudeDocSymlink(targetDir, result);
  ensureClaudeSkillsSymlink(targetDir, result);
  return result;
}

function copyDir(
  srcDir: string,
  destDir: string,
  prefix: string,
  realTarget: string,
  result: InitResult,
): string[] {
  const entries = readdirSync(srcDir);
  const copiedFiles: string[] = [];

  for (const entry of entries) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);
    const relPath = prefix ? `${prefix}/${entry}` : entry;
    const stat = statSync(srcPath);

    if (stat.isDirectory()) {
      ensureDirectorySlot(destPath);
      mkdirSync(destPath, { recursive: true });
      // Verify the created directory is physically inside targetDir
      const realDest = realpathSync(destPath);
      if (!isInsideTarget(realTarget, realDest)) {
        throw new Error(`Path escapes target directory: ${relPath}`);
      }
      const nested = copyDir(srcPath, destPath, relPath, realTarget, result);
      copiedFiles.push(...nested);
    } else if (stat.isFile()) {
      ensureRegularFileSlot(destPath);
      mkdirSync(destDir, { recursive: true });

      // Verify physical path after ensuring parent exists
      const realParent = realpathSync(destDir);
      const realDest = join(realParent, entry);
      if (!isInsideTarget(realTarget, realDest)) {
        throw new Error(`Path escapes target directory: ${relPath}`);
      }

      const srcContent = readFileSync(srcPath);
      if (existsSync(destPath)) {
        const destContent = readFileSync(destPath);
        if (Buffer.compare(srcContent, destContent) !== 0) {
          writeFileSync(destPath, srcContent);
          result.updated.push(relPath);
        } else {
          result.skipped.push(relPath);
        }
      } else {
        writeFileSync(destPath, srcContent);
        result.created.push(relPath);
      }
      copiedFiles.push(relPath);
    }
  }

  return copiedFiles;
}

/**
 * For pre-manifest workspaces, bootstrap tracking from files that are still
 * present in the current template. We intentionally avoid inferring ownership
 * of unknown files under .agents/skills so user-defined skills survive the
 * migration to manifest-based management.
 */
function bootstrapManifest(targetDir: string, currentTemplateFiles: string[]): string[] {
  const found: string[] = [];
  for (const file of currentTemplateFiles) {
    const absPath = join(targetDir, file);
    try {
      if (lstatSync(absPath).isFile()) {
        found.push(file);
      }
    } catch {
      // doesn't exist
    }
  }

  return found;
}

function loadManifest(targetDir: string): string[] {
  const manifestPath = join(targetDir, MANIFEST_FILE);
  if (!existsSync(manifestPath)) {
    return [];
  }
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function saveManifest(targetDir: string, files: string[]): void {
  const manifestPath = join(targetDir, MANIFEST_FILE);
  mkdirSync(dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(files, null, 2) + '\n');
}

function removeStaleFiles(
  targetDir: string,
  realTarget: string,
  oldManifest: string[],
  newFiles: string[],
  result: InitResult,
): void {
  const newSet = new Set(newFiles);

  for (const file of oldManifest) {
    if (newSet.has(file)) continue;

    const filePath = join(targetDir, file);

    // Boundary check: resolve the real path (following symlinks) and verify
    let realFilePath: string;
    try {
      realFilePath = realpathSync(filePath);
    } catch {
      // File doesn't exist — try resolving parent + basename
      try {
        const realParent = realpathSync(dirname(filePath));
        const basename = filePath.slice(filePath.lastIndexOf('/') + 1);
        realFilePath = join(realParent, basename);
      } catch {
        continue;
      }
    }
    if (!isInsideTarget(realTarget, realFilePath)) continue;

    // Only delete regular files
    try {
      const st = lstatSync(filePath);
      if (st.isFile()) {
        unlinkSync(filePath);
        result.removed.push(file);
      }
    } catch {
      continue;
    }

    // Clean up empty parent directories (up to targetDir)
    let dir = dirname(realFilePath);
    while (dir !== realTarget && dir.startsWith(realTarget + '/')) {
      try {
        const entries = readdirSync(dir);
        if (entries.length === 0) {
          rmdirSync(dir);
          dir = dirname(dir);
        } else {
          break;
        }
      } catch {
        break;
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
