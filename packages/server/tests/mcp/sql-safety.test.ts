/**
 * SQL Safety Module — Unit Tests
 *
 * Tests classifySql, hasMultipleStatements, checkSqlPermission, and validateSql.
 */

import { describe, test, expect } from 'bun:test';
import {
  classifySql,
  hasMultipleStatements,
  checkSqlPermission,
  validateSql,
} from '../../src/mcp/sql-safety';

describe('classifySql', () => {
  test('classifies SELECT', () => {
    expect(classifySql('SELECT * FROM todos')).toBe('select');
    expect(classifySql('  select id from tasks')).toBe('select');
  });

  test('classifies WITH (CTE)', () => {
    expect(classifySql('WITH cte AS (SELECT 1) SELECT * FROM cte')).toBe('select');
  });

  test('classifies EXPLAIN', () => {
    expect(classifySql('EXPLAIN QUERY PLAN SELECT 1')).toBe('select');
  });

  test('classifies read-only PRAGMA', () => {
    expect(classifySql('PRAGMA table_info("todos")')).toBe('pragma_read');
    expect(classifySql('  PRAGMA journal_mode')).toBe('pragma_read');
  });

  test('classifies writable PRAGMA', () => {
    expect(classifySql('PRAGMA journal_mode = WAL')).toBe('pragma_write');
    expect(classifySql('PRAGMA cache_size=10000')).toBe('pragma_write');
    expect(classifySql('  PRAGMA foreign_keys = ON')).toBe('pragma_write');
  });

  test('classifies INSERT', () => {
    expect(classifySql("INSERT INTO todos (title) VALUES ('test')")).toBe('dml');
  });

  test('classifies UPDATE', () => {
    expect(classifySql('UPDATE todos SET done = 1 WHERE id = 1')).toBe('dml');
  });

  test('classifies DELETE', () => {
    expect(classifySql('DELETE FROM todos WHERE id = 1')).toBe('dml');
  });

  test('classifies REPLACE', () => {
    expect(classifySql("REPLACE INTO todos (id, title) VALUES (1, 'test')")).toBe('dml');
  });

  test('classifies CREATE as DDL', () => {
    expect(classifySql('CREATE TABLE foo (id INTEGER)')).toBe('ddl');
  });

  test('classifies DROP as DDL', () => {
    expect(classifySql('DROP TABLE todos')).toBe('ddl');
  });

  test('classifies ALTER as DDL', () => {
    expect(classifySql('ALTER TABLE todos ADD COLUMN foo TEXT')).toBe('ddl');
  });

  test('classifies ATTACH as DDL', () => {
    expect(classifySql("ATTACH DATABASE ':memory:' AS mem")).toBe('ddl');
  });

  test('classifies DETACH as DDL', () => {
    expect(classifySql('DETACH DATABASE mem')).toBe('ddl');
  });

  test('classifies unknown statements', () => {
    expect(classifySql('VACUUM')).toBe('unknown');
    expect(classifySql('REINDEX')).toBe('unknown');
    expect(classifySql('')).toBe('unknown');
  });

  test('handles leading whitespace', () => {
    expect(classifySql('  \n  SELECT 1')).toBe('select');
    expect(classifySql('\t INSERT INTO x VALUES (1)')).toBe('dml');
  });
});

describe('hasMultipleStatements', () => {
  test('single statement without semicolon', () => {
    expect(hasMultipleStatements('SELECT 1')).toBe(false);
  });

  test('single statement with trailing semicolon', () => {
    expect(hasMultipleStatements('SELECT 1;')).toBe(false);
    expect(hasMultipleStatements('SELECT 1;  ')).toBe(false);
  });

  test('detects multiple statements', () => {
    expect(hasMultipleStatements('SELECT 1; DROP TABLE users')).toBe(true);
    expect(hasMultipleStatements('INSERT INTO x VALUES (1); SELECT 1')).toBe(true);
  });

  test('ignores semicolons inside string literals', () => {
    expect(hasMultipleStatements("SELECT 'hello; world'")).toBe(false);
    expect(hasMultipleStatements("INSERT INTO x VALUES ('a;b')")).toBe(false);
  });

  test('ignores semicolons inside double-quoted identifiers', () => {
    expect(hasMultipleStatements('SELECT "col;name" FROM x')).toBe(false);
  });

  test('ignores semicolons in single-line comments', () => {
    expect(hasMultipleStatements('SELECT 1 -- comment; here')).toBe(false);
  });

  test('ignores semicolons in multi-line comments', () => {
    expect(hasMultipleStatements('SELECT 1 /* comment; here */')).toBe(false);
  });
});

describe('checkSqlPermission', () => {
  test('SELECT allowed in both modes', () => {
    expect(checkSqlPermission('select', 'draft').allowed).toBe(true);
    expect(checkSqlPermission('select', 'stable').allowed).toBe(true);
  });

  test('read-only PRAGMA allowed in both modes', () => {
    expect(checkSqlPermission('pragma_read', 'draft').allowed).toBe(true);
    expect(checkSqlPermission('pragma_read', 'stable').allowed).toBe(true);
  });

  test('writable PRAGMA allowed in draft, denied in stable', () => {
    expect(checkSqlPermission('pragma_write', 'draft').allowed).toBe(true);
    expect(checkSqlPermission('pragma_write', 'stable').allowed).toBe(false);
    expect(checkSqlPermission('pragma_write', 'stable').error).toContain('not allowed');
  });

  test('DML allowed in draft, denied in stable', () => {
    expect(checkSqlPermission('dml', 'draft').allowed).toBe(true);
    expect(checkSqlPermission('dml', 'stable').allowed).toBe(false);
    expect(checkSqlPermission('dml', 'stable').error).toContain('not allowed');
  });

  test('DDL always denied', () => {
    expect(checkSqlPermission('ddl', 'draft').allowed).toBe(false);
    expect(checkSqlPermission('ddl', 'stable').allowed).toBe(false);
    expect(checkSqlPermission('ddl', 'draft').error).toContain('migration');
  });

  test('unknown always denied', () => {
    expect(checkSqlPermission('unknown', 'draft').allowed).toBe(false);
    expect(checkSqlPermission('unknown', 'stable').allowed).toBe(false);
  });
});

describe('validateSql', () => {
  test('allows valid SELECT in draft', () => {
    const result = validateSql('SELECT * FROM todos', 'draft');
    expect(result.allowed).toBe(true);
  });

  test('allows DML in draft', () => {
    const result = validateSql("INSERT INTO todos (title) VALUES ('test')", 'draft');
    expect(result.allowed).toBe(true);
  });

  test('denies DML in stable', () => {
    const result = validateSql("INSERT INTO todos (title) VALUES ('test')", 'stable');
    expect(result.allowed).toBe(false);
  });

  test('denies DDL in any mode', () => {
    expect(validateSql('CREATE TABLE foo (id INT)', 'draft').allowed).toBe(false);
    expect(validateSql('DROP TABLE todos', 'stable').allowed).toBe(false);
  });

  test('denies multiple statements', () => {
    const result = validateSql('SELECT 1; DROP TABLE users', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Multiple');
    expect(result.reason).toBe('multi_statement');
  });

  test('permission denial has reason "permission"', () => {
    const result = validateSql('DROP TABLE users', 'draft');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('permission');
  });

  test('writable PRAGMA denied in stable', () => {
    const result = validateSql('PRAGMA journal_mode = WAL', 'stable');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('permission');
  });

  test('read-only PRAGMA allowed in stable', () => {
    const result = validateSql('PRAGMA table_info("todos")', 'stable');
    expect(result.allowed).toBe(true);
  });
});
