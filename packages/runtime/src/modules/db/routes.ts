import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { RuntimeAppEnv } from '../../middleware/app-entry-resolver';
import { buildQuery, QueryError, type QueryParams } from './query-builder';
import { introspectSchema } from './schema';
import { executeSql, SqlError } from './sql';
import { validateSql, classifySql } from './sql-safety';

const MAX_SQL_ROWS = 1000;
const SQL_TIMEOUT_MS = 5000;

export function createDbRoutes() {
  const app = new Hono<RuntimeAppEnv>();

  // GET /schema
  app.get('/schema', (c) => {
    const entry = c.get('appEntry');
    const schema = introspectSchema(entry.db!);
    return c.json({ data: schema });
  });

  // POST /sql - Execute raw SQL
  app.post('/sql', async (c) => {
    const entry = c.get('appEntry');
    const body = await c.req.json();

    if (!body.sql || typeof body.sql !== 'string') {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Missing "sql" field' } }, 400);
    }

    try {
      const result = executeSql(entry.db!, body.sql, body.params);
      return c.json({ data: result });
    } catch (err) {
      if (err instanceof SqlError) {
        return c.json({ error: { code: 'BAD_REQUEST', message: err.message } }, 400);
      }
      throw err;
    }
  });

  // POST /_sql - Execute SQL with safety checks
  app.post('/_sql', async (c) => {
    const entry = c.get('appEntry');
    const mode = c.get('appMode');

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: { code: 'SQL_INVALID', message: 'Invalid JSON in request body' } }, 400);
    }

    if (!body.sql || typeof body.sql !== 'string') {
      return c.json({ error: { code: 'SQL_INVALID', message: 'Missing "sql" field' } }, 400);
    }

    const check = validateSql(body.sql, mode);
    if (!check.allowed) {
      if (check.reason === 'multi_statement') {
        return c.json({ error: { code: 'SQL_INVALID', message: check.error } }, 400);
      }
      return c.json({ error: { code: 'SQL_NOT_ALLOWED', message: check.error } }, 403);
    }

    try {
      const classification = classifySql(body.sql);
      const isDml = classification === 'dml';

      const executeQuery = () => {
        const stmt = entry.db!.query(body.sql);

        if (isDml) {
          // DML: use run() to get changes/lastInsertRowid
          const result = stmt.run() as { changes: number; lastInsertRowid: number | bigint };
          return {
            columns: ['changes', 'lastInsertRowid'],
            rows: [[result.changes, Number(result.lastInsertRowid)]],
            rowCount: 1,
          };
        }

        // SELECT / PRAGMA: use all() to get rows
        const rows = stmt.all() as Record<string, unknown>[];
        const limitedRows = rows.slice(0, MAX_SQL_ROWS);
        const columns = limitedRows.length > 0 ? Object.keys(limitedRows[0]) : [];
        const rowArrays = limitedRows.map((row) => columns.map((col) => row[col]));
        return { columns, rows: rowArrays, rowCount: rowArrays.length };
      };

      const data = await Promise.race([
        new Promise<{ columns: string[]; rows: unknown[][]; rowCount: number }>((resolve, reject) => {
          try { resolve(executeQuery()); } catch (err) { reject(err); }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SQL execution timed out (5s limit)')), SQL_TIMEOUT_MS),
        ),
      ]);

      return c.json({ data });
    } catch (error: any) {
      if (error.message?.includes('timed out')) {
        return c.json({ error: { code: 'SQL_TIMEOUT', message: error.message } }, 408);
      }
      return c.json({ error: { code: 'SQL_INVALID', message: `SQL execution error: ${error.message}` } }, 400);
    }
  });

  // GET /:table - List records
  app.get('/:table', (c) => {
    const entry = c.get('appEntry');
    const table = c.req.param('table')!;

    if (!isValidTableName(table)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Invalid table name: ${table}` } }, 400);
    }
    if (table.startsWith('_') || table.startsWith('sqlite_')) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Cannot access internal table '${table}' via CRUD API` } }, 400);
    }
    if (!tableExists(entry.db!, table)) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Table '${table}' does not exist` } }, 404);
    }

    const params: QueryParams = {
      select: c.req.query('select'),
      where: c.req.queries('where'),
      order: c.req.query('order'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    };

    const knownParams = new Set(['select', 'where', 'order', 'limit', 'offset']);
    const url = new URL(c.req.url);
    for (const [key, value] of url.searchParams.entries()) {
      if (!knownParams.has(key) && value !== '') {
        const existing = params.where ?? [];
        const arr = Array.isArray(existing) ? existing : [existing];
        arr.push(`${key}.eq.${value}`);
        params.where = arr;
      }
    }

    try {
      const query = buildQuery(table, params);
      const sql = `SELECT ${query.selectClause} FROM "${table}" ${query.whereClause} ${query.orderClause} ${query.limitClause}`;
      const rows = entry.db!.query(sql).all(...query.values);

      const countSql = `SELECT COUNT(*) as count FROM "${table}" ${query.whereClause}`;
      const countResult = entry.db!.query(countSql).get(...query.values) as { count: number };

      return c.json({
        data: rows,
        meta: {
          total: countResult.count,
          limit: parseInt(c.req.query('limit') ?? '1000', 10),
          offset: parseInt(c.req.query('offset') ?? '0', 10),
        },
      });
    } catch (err) {
      if (err instanceof QueryError) {
        return c.json({ error: { code: 'BAD_REQUEST', message: err.message } }, 400);
      }
      return c.json({ error: { code: 'BAD_REQUEST', message: `Query error: ${(err as Error).message}` } }, 400);
    }
  });

  // GET /:table/:id - Get single record
  app.get('/:table/:id', (c) => {
    const entry = c.get('appEntry');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;

    if (!isValidTableName(table)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Invalid table name: ${table}` } }, 400);
    }
    if (!tableExists(entry.db!, table)) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Table '${table}' does not exist` } }, 404);
    }

    const pk = getPrimaryKey(entry.db!, table);
    const row = entry.db!.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id);

    if (!row) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Record not found in '${table}' with ${pk}='${id}'` } }, 404);
    }

    return c.json({ data: row });
  });

  // POST /:table - Create record
  app.post('/:table', async (c) => {
    const entry = c.get('appEntry');
    const table = c.req.param('table')!;

    if (!isValidTableName(table)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Invalid table name: ${table}` } }, 400);
    }
    if (!tableExists(entry.db!, table)) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Table '${table}' does not exist` } }, 404);
    }

    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' } }, 400);
    }

    const pk = getPrimaryKey(entry.db!, table);
    if (pk === 'id' && !body.id) {
      const pkType = getPrimaryKeyType(entry.db!, table);
      if (!pkType.toUpperCase().includes('INT')) {
        body.id = nanoid(12);
      }
    }

    const columns = Object.keys(body);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(body);
    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    try {
      entry.db!.query(sql).run(...(values as any[]));
    } catch (error: any) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Insert error: ${error.message}` } }, 400);
    }

    const record = entry.db!.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(body[pk]);
    return c.json({ data: record }, 201);
  });

  // PATCH /:table/:id - Update record
  app.patch('/:table/:id', async (c) => {
    const entry = c.get('appEntry');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;

    if (!isValidTableName(table)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Invalid table name: ${table}` } }, 400);
    }
    if (!tableExists(entry.db!, table)) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Table '${table}' does not exist` } }, 404);
    }

    const pk = getPrimaryKey(entry.db!, table);
    const oldRecord = entry.db!.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id);
    if (!oldRecord) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Record not found in '${table}' with ${pk}='${id}'` } }, 404);
    }

    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Request body must be a JSON object' } }, 400);
    }

    const columns = Object.keys(body);
    if (columns.length === 0) {
      return c.json({ data: oldRecord });
    }

    const setClause = columns.map((col) => `"${col}" = ?`).join(', ');
    const values = [...Object.values(body), id];

    try {
      entry.db!.query(`UPDATE "${table}" SET ${setClause} WHERE "${pk}" = ?`).run(...(values as any[]));
    } catch (error: any) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Update error: ${error.message}` } }, 400);
    }

    const record = entry.db!.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id);
    return c.json({ data: record });
  });

  // DELETE /:table/:id - Delete record
  app.delete('/:table/:id', (c) => {
    const entry = c.get('appEntry');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;

    if (!isValidTableName(table)) {
      return c.json({ error: { code: 'BAD_REQUEST', message: `Invalid table name: ${table}` } }, 400);
    }
    if (!tableExists(entry.db!, table)) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Table '${table}' does not exist` } }, 404);
    }

    const pk = getPrimaryKey(entry.db!, table);
    const oldRecord = entry.db!.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id);
    if (!oldRecord) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Record not found in '${table}' with ${pk}='${id}'` } }, 404);
    }

    entry.db!.query(`DELETE FROM "${table}" WHERE "${pk}" = ?`).run(id);
    return c.json({ success: true });
  });

  return app;
}

// --- Helpers ---

function isValidTableName(table: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table);
}

function tableExists(db: any, table: string): boolean {
  const result = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?").get(table);
  return !!result;
}

function getPrimaryKey(db: any, table: string): string {
  const columns = db.query(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number }[];
  const pk = columns.find((c: any) => c.pk === 1);
  return pk?.name ?? 'rowid';
}

function getPrimaryKeyType(db: any, table: string): string {
  const columns = db.query(`PRAGMA table_info("${table}")`).all() as { name: string; pk: number; type: string }[];
  const pk = columns.find((c: any) => c.pk === 1);
  return pk?.type ?? 'INTEGER';
}
