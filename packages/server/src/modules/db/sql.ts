import type { Database } from 'bun:sqlite';
import { BadRequestError } from '../../core/errors';

/** Allowed SQL statement types for raw SQL execution */
const ALLOWED_PREFIXES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'PRAGMA', 'WITH'];

const DISALLOWED_PATTERNS = [
  /ATTACH\s+DATABASE/i,
  /DETACH\s+DATABASE/i,
  /LOAD_EXTENSION/i,
];

export interface SqlResult {
  columns?: string[];
  rows?: any[];
  changes?: number;
  lastInsertRowid?: number;
}

export function executeSql(db: Database, sql: string, params: any[] = []): SqlResult {
  const trimmed = sql.trim();

  // Basic safety checks
  if (!trimmed) {
    throw new BadRequestError('Empty SQL statement');
  }

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(trimmed)) {
      throw new BadRequestError('This SQL operation is not allowed');
    }
  }

  const firstWord = trimmed.split(/\s+/)[0].toUpperCase();
  if (!ALLOWED_PREFIXES.includes(firstWord)) {
    throw new BadRequestError(`SQL statement type '${firstWord}' is not allowed`);
  }

  try {
    if (firstWord === 'SELECT' || firstWord === 'PRAGMA' || firstWord === 'WITH') {
      const stmt = db.query(trimmed);
      const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
      const columns = stmt.columnNames;
      return { columns, rows };
    } else {
      const stmt = db.query(trimmed);
      const result = params.length > 0 ? stmt.run(...params) : stmt.run();
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    }
  } catch (error: any) {
    throw new BadRequestError(`SQL error: ${error.message}`);
  }
}
