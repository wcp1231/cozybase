import type { Database } from 'bun:sqlite';
import { z } from 'zod';
import { BadRequestError } from '../../core/errors';

const ColumnSchema = z.object({
  name: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  type: z.enum(['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC']),
  primary_key: z.boolean().optional(),
  not_null: z.boolean().optional(),
  unique: z.boolean().optional(),
  default: z.string().optional(),
  references: z.string().optional(), // e.g. "users(id)"
});

const CreateTableSchema = z.object({
  action: z.literal('create_table'),
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  columns: z.array(ColumnSchema).min(1),
  if_not_exists: z.boolean().optional(),
});

const AlterTableSchema = z.object({
  action: z.literal('alter_table'),
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  add_column: ColumnSchema.optional(),
  drop_column: z.string().optional(),
  rename_column: z.object({ from: z.string(), to: z.string() }).optional(),
  rename_table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/).optional(),
});

const DropTableSchema = z.object({
  action: z.literal('drop_table'),
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  if_exists: z.boolean().optional(),
});

const SchemaActionSchema = z.discriminatedUnion('action', [
  CreateTableSchema,
  AlterTableSchema,
  DropTableSchema,
]);

export type SchemaAction = z.infer<typeof SchemaActionSchema>;

/** Introspect all tables and their columns */
export function introspectSchema(db: Database): Record<string, any> {
  const tables = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];

  const schema: Record<string, any> = {};

  for (const { name } of tables) {
    const columns = db.query(`PRAGMA table_info('${name}')`).all();
    const foreignKeys = db.query(`PRAGMA foreign_key_list('${name}')`).all();
    const indexes = db.query(`PRAGMA index_list('${name}')`).all();
    schema[name] = { columns, foreignKeys, indexes };
  }

  return schema;
}

/** Execute a schema action (create/alter/drop table) */
export function executeSchemaAction(db: Database, body: unknown): { success: boolean; sql: string } {
  const parsed = SchemaActionSchema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestError(parsed.error.issues.map((i) => i.message).join(', '));
  }

  const action = parsed.data;

  // Prevent modifying internal tables
  if ('table' in action && action.table.startsWith('_')) {
    throw new BadRequestError('Cannot modify internal tables (prefixed with _)');
  }

  let sql: string;

  switch (action.action) {
    case 'create_table':
      sql = buildCreateTable(action);
      break;
    case 'alter_table':
      sql = buildAlterTable(action);
      break;
    case 'drop_table':
      sql = `DROP TABLE ${action.if_exists ? 'IF EXISTS ' : ''}"${action.table}"`;
      break;
  }

  db.exec(sql);
  return { success: true, sql };
}

function buildCreateTable(action: z.infer<typeof CreateTableSchema>): string {
  const ifNotExists = action.if_not_exists ? 'IF NOT EXISTS ' : '';
  const columnDefs = action.columns.map((col) => {
    const parts = [`"${col.name}"`, col.type];
    if (col.primary_key) parts.push('PRIMARY KEY');
    if (col.not_null) parts.push('NOT NULL');
    if (col.unique) parts.push('UNIQUE');
    if (col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
    if (col.references) parts.push(`REFERENCES ${col.references}`);
    return parts.join(' ');
  });

  return `CREATE TABLE ${ifNotExists}"${action.table}" (${columnDefs.join(', ')})`;
}

function buildAlterTable(action: z.infer<typeof AlterTableSchema>): string {
  if (action.add_column) {
    const col = action.add_column;
    const parts = [`"${col.name}"`, col.type];
    if (col.not_null) parts.push('NOT NULL');
    if (col.default !== undefined) parts.push(`DEFAULT ${col.default}`);
    return `ALTER TABLE "${action.table}" ADD COLUMN ${parts.join(' ')}`;
  }

  if (action.drop_column) {
    return `ALTER TABLE "${action.table}" DROP COLUMN "${action.drop_column}"`;
  }

  if (action.rename_column) {
    return `ALTER TABLE "${action.table}" RENAME COLUMN "${action.rename_column.from}" TO "${action.rename_column.to}"`;
  }

  if (action.rename_table) {
    return `ALTER TABLE "${action.table}" RENAME TO "${action.rename_table}"`;
  }

  throw new BadRequestError('No alter action specified');
}
