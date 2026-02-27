/**
 * SQL Safety Module
 *
 * Classifies SQL statements and enforces permission rules for
 * Draft vs Stable database access.
 */

// --- SQL Classification ---

export type SqlClassification = 'select' | 'dml' | 'ddl' | 'pragma_read' | 'pragma_write' | 'unknown';

/**
 * Classify a SQL statement by its first keyword.
 *
 * PRAGMA statements are split into read-only vs writable:
 * - Read-only: PRAGMA without assignment (e.g., `PRAGMA table_info(...)`)
 * - Writable: PRAGMA with `=` assignment (e.g., `PRAGMA journal_mode = WAL`)
 */
export function classifySql(sql: string): SqlClassification {
  const normalized = sql.trimStart().toUpperCase();

  if (/^(SELECT|WITH)\b/.test(normalized)) return 'select';
  if (/^EXPLAIN\b/.test(normalized)) return 'select';
  if (/^PRAGMA\b/.test(normalized)) {
    // Writable PRAGMA: contains `=` after PRAGMA keyword (e.g., PRAGMA journal_mode = WAL)
    if (/^PRAGMA\s+\w+\s*=/.test(normalized)) return 'pragma_write';
    return 'pragma_read';
  }
  if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(normalized)) return 'dml';
  if (/^(CREATE|DROP|ALTER|ATTACH|DETACH)\b/.test(normalized)) return 'ddl';
  return 'unknown';
}

// --- Multi-Statement Detection ---

/**
 * Detect if SQL contains multiple statements separated by semicolons.
 * Returns true if the SQL is dangerous (contains multiple statements).
 *
 * Strips string literals and comments before checking for semicolons
 * to avoid false positives from semicolons inside strings.
 */
export function hasMultipleStatements(sql: string): boolean {
  // Strip string literals (single-quoted)
  let stripped = sql.replace(/'[^']*'/g, "''");
  // Strip double-quoted identifiers
  stripped = stripped.replace(/"[^"]*"/g, '""');
  // Strip single-line comments
  stripped = stripped.replace(/--[^\n]*/g, '');
  // Strip multi-line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');

  // Check for semicolon followed by non-whitespace (another statement)
  const trimmed = stripped.trim();
  // Remove trailing semicolon (single statement ending with ;)
  const withoutTrailing = trimmed.replace(/;\s*$/, '');
  return withoutTrailing.includes(';');
}

// --- Permission Check ---

export type SqlMode = 'draft' | 'stable';

export interface SqlPermissionResult {
  allowed: boolean;
  error?: string;
}

/**
 * Check if a SQL statement classification is allowed for the given mode.
 *
 * Permission matrix:
 * | Classification | Draft | Stable |
 * |----------------|-------|--------|
 * | select         | OK    | OK     |
 * | pragma_read    | OK    | OK     |
 * | pragma_write   | OK    | DENY   |
 * | dml            | OK    | DENY   |
 * | ddl            | DENY  | DENY   |
 * | unknown        | DENY  | DENY   |
 */
export function checkSqlPermission(
  classification: SqlClassification,
  mode: SqlMode,
): SqlPermissionResult {
  // SELECT and read-only PRAGMA are always allowed
  if (classification === 'select' || classification === 'pragma_read') {
    return { allowed: true };
  }

  // Writable PRAGMA allowed only in draft
  if (classification === 'pragma_write') {
    if (mode === 'draft') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: 'Writable PRAGMA statements are not allowed in stable mode',
    };
  }

  // DML allowed only in draft
  if (classification === 'dml') {
    if (mode === 'draft') {
      return { allowed: true };
    }
    return {
      allowed: false,
      error: 'DML statements (INSERT/UPDATE/DELETE/REPLACE) are not allowed in stable mode',
    };
  }

  // DDL always forbidden
  if (classification === 'ddl') {
    return {
      allowed: false,
      error: 'DDL statements (CREATE/DROP/ALTER) are forbidden. Use migration files for schema changes.',
    };
  }

  // Unknown always forbidden
  return {
    allowed: false,
    error: `Unrecognized SQL statement type. Only SELECT, DML (in draft), and read-only PRAGMA are allowed.`,
  };
}

export interface SqlValidationResult {
  allowed: boolean;
  error?: string;
  /** Reason for rejection: 'multi_statement' | 'permission' */
  reason?: 'multi_statement' | 'permission';
}

/**
 * Full SQL safety check: multi-statement detection + classification + permission.
 */
export function validateSql(
  sql: string,
  mode: SqlMode,
): SqlValidationResult {
  if (hasMultipleStatements(sql)) {
    return {
      allowed: false,
      error: 'Multiple SQL statements are not allowed. Submit one statement at a time.',
      reason: 'multi_statement',
    };
  }

  const classification = classifySql(sql);
  const result = checkSqlPermission(classification, mode);
  if (!result.allowed) {
    return { ...result, reason: 'permission' };
  }
  return result;
}
