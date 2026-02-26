import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { AppEnv } from '../../middleware/app-resolver';
import { eventBus, type ChangeEvent } from '../../core/event-bus';
import { AppError, BadRequestError, NotFoundError } from '../../core/errors';
import { buildQuery, type QueryParams } from './query-builder';
import { introspectSchema } from './schema';
import { executeSql } from './sql';
import { validateSql } from '../../mcp/sql-safety';

const MAX_SQL_ROWS = 1000;
const SQL_TIMEOUT_MS = 5000;

export function createDbRoutes() {
  const app = new Hono<AppEnv>();

  // --- Schema endpoint (read-only) ---

  // GET /schema - Introspect all tables
  app.get('/schema', (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    const schema = introspectSchema(db);
    return c.json({ data: schema });
  });

  // --- Raw SQL endpoint ---

  // POST /sql - Execute raw SQL
  app.post('/sql', async (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    const body = await c.req.json();

    if (!body.sql || typeof body.sql !== 'string') {
      throw new BadRequestError('Missing "sql" field');
    }

    const result = executeSql(db, body.sql, body.params);
    return c.json({ data: result });
  });

  // POST /_sql - Execute SQL with safety checks (for MCP RemoteBackend)
  app.post('/_sql', async (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;

    let body: any;
    try {
      body = await c.req.json();
    } catch {
      throw new AppError(400, 'Invalid JSON in request body', 'SQL_INVALID');
    }

    if (!body.sql || typeof body.sql !== 'string') {
      throw new AppError(400, 'Missing "sql" field', 'SQL_INVALID');
    }

    // SQL classification + permission check
    const sqlMode = mode === 'stable' ? 'stable' : 'draft';
    const check = validateSql(body.sql, sqlMode as 'draft' | 'stable');
    if (!check.allowed) {
      // Multi-statement → 400 SQL_INVALID; permission denial → 403 SQL_NOT_ALLOWED
      if (check.reason === 'multi_statement') {
        throw new AppError(400, check.error!, 'SQL_INVALID');
      }
      throw new AppError(403, check.error!, 'SQL_NOT_ALLOWED');
    }

    try {
      const executeQuery = () => {
        const stmt = db.query(body.sql);
        const rows = stmt.all() as Record<string, unknown>[];

        // Limit result set
        const limitedRows = rows.slice(0, MAX_SQL_ROWS);

        // Extract column names
        const columns = limitedRows.length > 0
          ? Object.keys(limitedRows[0])
          : [];

        // Convert to array format
        const rowArrays = limitedRows.map((row) =>
          columns.map((col) => row[col]),
        );

        return { columns, rows: rowArrays, rowCount: rowArrays.length };
      };

      const data = await Promise.race([
        new Promise<{ columns: string[]; rows: unknown[][]; rowCount: number }>((resolve, reject) => {
          try {
            resolve(executeQuery());
          } catch (err) {
            reject(err);
          }
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('SQL execution timed out (5s limit)')), SQL_TIMEOUT_MS),
        ),
      ]);

      return c.json({ data });
    } catch (error: any) {
      if (error.message?.includes('timed out')) {
        throw new AppError(408, error.message, 'SQL_TIMEOUT');
      }
      throw new AppError(400, `SQL execution error: ${error.message}`, 'SQL_INVALID');
    }
  });

  // --- Auto CRUD endpoints ---

  // GET /:table - List records
  app.get('/:table', (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const table = c.req.param('table')!;
    validateTableName(table);

    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    assertTableExists(db, table);

    const params: QueryParams = {
      select: c.req.query('select'),
      where: c.req.queries('where'),
      order: c.req.query('order'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    };

    // Treat unknown query params as shorthand equality filters.
    // e.g. ?completed=1 → WHERE completed = 1 (same as ?where=completed.eq.1)
    // Empty values are skipped so that optional filters work naturally.
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

    const query = buildQuery(table, params);
    const sql = `SELECT ${query.selectClause} FROM "${table}" ${query.whereClause} ${query.orderClause} ${query.limitClause}`;

    try {
      const rows = db.query(sql).all(...query.values);

      // Get total count for pagination
      const countSql = `SELECT COUNT(*) as count FROM "${table}" ${query.whereClause}`;
      const countResult = db.query(countSql).get(...query.values) as { count: number };

      return c.json({
        data: rows,
        meta: {
          total: countResult.count,
          limit: parseInt(c.req.query('limit') ?? '1000', 10),
          offset: parseInt(c.req.query('offset') ?? '0', 10),
        },
      });
    } catch (error: any) {
      throw new BadRequestError(`Query error: ${error.message}`);
    }
  });

  // GET /:table/:id - Get single record
  app.get('/:table/:id', (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;
    validateTableName(table);

    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    assertTableExists(db, table);

    const pk = getPrimaryKey(db, table);
    const row = db.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id);

    if (!row) {
      throw new NotFoundError(`Record not found in '${table}' with ${pk}='${id}'`);
    }

    return c.json({ data: row });
  });

  // POST /:table - Create record
  app.post('/:table', async (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const table = c.req.param('table')!;
    validateTableName(table);

    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    assertTableExists(db, table);

    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestError('Request body must be a JSON object');
    }

    // Auto-generate id if column exists, is not INTEGER type, and not provided
    const pk = getPrimaryKey(db, table);
    if (pk === 'id' && !body.id) {
      const pkType = getPrimaryKeyType(db, table);
      if (!pkType.toUpperCase().includes('INT')) {
        body.id = nanoid(12);
      }
    }

    const columns = Object.keys(body);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(body);

    const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders})`;

    try {
      db.query(sql).run(...values);
    } catch (error: any) {
      throw new BadRequestError(`Insert error: ${error.message}`);
    }

    // Read back the inserted record
    const record = db.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(body[pk]) as Record<string, unknown>;

    emitChange(appContext.name, table, 'INSERT', record);

    return c.json({ data: record }, 201);
  });

  // PATCH /:table/:id - Update record
  app.patch('/:table/:id', async (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;
    validateTableName(table);

    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    assertTableExists(db, table);

    const pk = getPrimaryKey(db, table);

    const oldRecord = db.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id) as Record<string, unknown> | null;
    if (!oldRecord) {
      throw new NotFoundError(`Record not found in '${table}' with ${pk}='${id}'`);
    }

    const body = await c.req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestError('Request body must be a JSON object');
    }

    const columns = Object.keys(body);
    if (columns.length === 0) {
      return c.json({ data: oldRecord });
    }

    const setClause = columns.map((col) => `"${col}" = ?`).join(', ');
    const values = [...Object.values(body), id];

    try {
      db.query(`UPDATE "${table}" SET ${setClause} WHERE "${pk}" = ?`).run(...values);
    } catch (error: any) {
      throw new BadRequestError(`Update error: ${error.message}`);
    }

    const record = db.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id) as Record<string, unknown>;

    emitChange(appContext.name, table, 'UPDATE', record, oldRecord);

    return c.json({ data: record });
  });

  // DELETE /:table/:id - Delete record
  app.delete('/:table/:id', (c) => {
    const appContext = c.get('appContext');
    const mode = c.get('appMode');
    const table = c.req.param('table')!;
    const id = c.req.param('id')!;
    validateTableName(table);

    const db = mode === 'stable' ? appContext.stableDb : appContext.draftDb;
    assertTableExists(db, table);

    const pk = getPrimaryKey(db, table);

    const oldRecord = db.query(`SELECT * FROM "${table}" WHERE "${pk}" = ?`).get(id) as Record<string, unknown> | null;
    if (!oldRecord) {
      throw new NotFoundError(`Record not found in '${table}' with ${pk}='${id}'`);
    }

    db.query(`DELETE FROM "${table}" WHERE "${pk}" = ?`).run(id);

    emitChange(appContext.name, table, 'DELETE', oldRecord, oldRecord);

    return c.json({ success: true });
  });

  return app;
}

// --- Helpers ---

function validateTableName(table: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    throw new BadRequestError(`Invalid table name: ${table}`);
  }
  if (table.startsWith('_') || table.startsWith('sqlite_')) {
    throw new BadRequestError(`Cannot access internal table '${table}' via CRUD API`);
  }
}

function assertTableExists(db: any, table: string): void {
  const result = db
    .query("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
    .get(table);
  if (!result) {
    throw new NotFoundError(`Table '${table}' does not exist`);
  }
}

function getPrimaryKey(db: any, table: string): string {
  const columns = db.query(`PRAGMA table_info("${table}")`).all() as {
    name: string;
    pk: number;
  }[];
  const pk = columns.find((c) => c.pk === 1);
  return pk?.name ?? 'rowid';
}

function getPrimaryKeyType(db: any, table: string): string {
  const columns = db.query(`PRAGMA table_info("${table}")`).all() as {
    name: string;
    pk: number;
    type: string;
  }[];
  const pk = columns.find((c) => c.pk === 1);
  return pk?.type ?? 'INTEGER';
}

function emitChange(
  appName: string,
  table: string,
  action: ChangeEvent['action'],
  record: Record<string, unknown>,
  oldRecord?: Record<string, unknown>,
): void {
  eventBus.emit(`db:${appName}:${table}`, {
    appId: appName,
    table,
    action,
    record,
    oldRecord,
  } satisfies ChangeEvent);
}
