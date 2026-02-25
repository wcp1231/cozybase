import { Hono } from 'hono';
import { nanoid } from 'nanoid';
import type { AppEnv } from '../../middleware/app-resolver';
import { eventBus, type ChangeEvent } from '../../core/event-bus';
import { BadRequestError, NotFoundError } from '../../core/errors';
import { buildQuery, type QueryParams } from './query-builder';
import { introspectSchema } from './schema';
import { executeSql } from './sql';

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

    // Auto-generate id if column exists and not provided
    const pk = getPrimaryKey(db, table);
    if (pk === 'id' && !body.id) {
      body.id = nanoid(12);
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
