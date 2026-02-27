export type SqlClassification = 'select' | 'dml' | 'ddl' | 'pragma_read' | 'pragma_write' | 'unknown';

export function classifySql(sql: string): SqlClassification {
  const normalized = sql.trimStart().toUpperCase();

  if (/^(SELECT|WITH)\b/.test(normalized)) return 'select';
  if (/^EXPLAIN\b/.test(normalized)) return 'select';
  if (/^PRAGMA\b/.test(normalized)) {
    if (/^PRAGMA\s+\w+\s*=/.test(normalized)) return 'pragma_write';
    return 'pragma_read';
  }
  if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(normalized)) return 'dml';
  if (/^(CREATE|DROP|ALTER|ATTACH|DETACH)\b/.test(normalized)) return 'ddl';
  return 'unknown';
}

export function hasMultipleStatements(sql: string): boolean {
  let stripped = sql.replace(/'[^']*'/g, "''");
  stripped = stripped.replace(/"[^"]*"/g, '""');
  stripped = stripped.replace(/--[^\n]*/g, '');
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');

  const trimmed = stripped.trim();
  const withoutTrailing = trimmed.replace(/;\s*$/, '');
  return withoutTrailing.includes(';');
}

export type SqlMode = 'draft' | 'stable';

export interface SqlPermissionResult {
  allowed: boolean;
  error?: string;
}

export function checkSqlPermission(
  classification: SqlClassification,
  mode: SqlMode,
): SqlPermissionResult {
  if (classification === 'select' || classification === 'pragma_read') {
    return { allowed: true };
  }

  if (classification === 'pragma_write') {
    if (mode === 'draft') return { allowed: true };
    return { allowed: false, error: 'Writable PRAGMA statements are not allowed in stable mode' };
  }

  if (classification === 'dml') {
    if (mode === 'draft') return { allowed: true };
    return { allowed: false, error: 'DML statements (INSERT/UPDATE/DELETE/REPLACE) are not allowed in stable mode' };
  }

  if (classification === 'ddl') {
    return { allowed: false, error: 'DDL statements (CREATE/DROP/ALTER) are forbidden. Use migration files for schema changes.' };
  }

  return { allowed: false, error: 'Unrecognized SQL statement type. Only SELECT, DML (in draft), and read-only PRAGMA are allowed.' };
}

export interface SqlValidationResult {
  allowed: boolean;
  error?: string;
  reason?: 'multi_statement' | 'permission';
}

export function validateSql(sql: string, mode: SqlMode): SqlValidationResult {
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
