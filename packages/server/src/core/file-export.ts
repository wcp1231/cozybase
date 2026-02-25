import type { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve, dirname } from 'path';

/**
 * Export function files from Platform DB to a target directory.
 * Used by both DraftReconciler (→ draft dir) and Publisher (→ stable dir).
 */
export function exportFunctionsFromDb(
  platformDb: Database,
  appName: string,
  targetDir: string,
): string[] {
  // Clean target directory
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  // Query function files
  const records = platformDb.query(
    "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'functions/%'",
  ).all(appName) as { path: string; content: string }[];

  if (records.length === 0) return [];

  mkdirSync(targetDir, { recursive: true });
  const exported: string[] = [];
  const resolvedTargetDir = resolve(targetDir);

  for (const record of records) {
    const filename = record.path.replace('functions/', '');
    // Path safety: ensure resolved path stays within targetDir
    const dest = resolve(targetDir, filename);
    if (!dest.startsWith(resolvedTargetDir + '/')) {
      console.warn(`[file-export] Skipping unsafe path: ${record.path}`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, record.content, 'utf-8');
    exported.push(filename);
  }

  return exported;
}
