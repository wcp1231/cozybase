import type { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

// --- Types ---

export interface SeedResult {
  success: boolean;
  loaded: string[];   // filenames of loaded seed files
  error?: string;
  failedSeed?: string;
}

const SeedJsonSchema = z.object({
  table: z.string(),
  rows: z.array(z.record(z.unknown())).min(1),
});

// --- SeedLoader ---

export class SeedLoader {
  /** Load seeds from DB records (app_files query result) */
  loadSeedsFromRecords(db: Database, records: { path: string; content: string }[]): SeedResult {
    if (records.length === 0) {
      return { success: true, loaded: [] };
    }

    // Sort by path to ensure order
    const sorted = [...records].sort((a, b) => a.path.localeCompare(b.path));
    const loaded: string[] = [];

    for (const record of sorted) {
      const filename = record.path.replace(/^seeds\//, '');

      try {
        if (filename.endsWith('.sql')) {
          db.exec(record.content);
          loaded.push(filename);
        } else if (filename.endsWith('.json')) {
          const parsed = JSON.parse(record.content);
          const seed = SeedJsonSchema.parse(parsed);
          this.insertJsonSeed(db, seed.table, seed.rows);
          loaded.push(filename);
        }
        // Skip non-.sql/.json files silently
      } catch (err: any) {
        return {
          success: false,
          loaded,
          error: err.message,
          failedSeed: filename,
        };
      }
    }

    return { success: true, loaded };
  }

  /** Load all seed files from a directory into the database (used for filesystem migration) */
  loadSeeds(db: Database, seedsDir: string): SeedResult {
    if (!existsSync(seedsDir)) {
      return { success: true, loaded: [] };
    }

    const files = readdirSync(seedsDir).sort();
    const loaded: string[] = [];

    for (const filename of files) {
      const filePath = join(seedsDir, filename);

      try {
        if (filename.endsWith('.sql')) {
          const sql = readFileSync(filePath, 'utf-8');
          db.exec(sql);
          loaded.push(filename);
        } else if (filename.endsWith('.json')) {
          const content = readFileSync(filePath, 'utf-8');
          const parsed = JSON.parse(content);
          const seed = SeedJsonSchema.parse(parsed);
          this.insertJsonSeed(db, seed.table, seed.rows);
          loaded.push(filename);
        }
        // Skip non-.sql/.json files silently
      } catch (err: any) {
        return {
          success: false,
          loaded,
          error: err.message,
          failedSeed: filename,
        };
      }
    }

    return { success: true, loaded };
  }

  /** Convert JSON rows to INSERT statements and execute */
  private insertJsonSeed(db: Database, table: string, rows: Record<string, unknown>[]): void {
    for (const row of rows) {
      const columns = Object.keys(row);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((col) => row[col]);
      const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;
      db.query(sql).run(...(values as any[]));
    }
  }
}
