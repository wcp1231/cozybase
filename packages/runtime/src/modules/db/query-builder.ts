/** Operators for WHERE clauses */
const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'LIKE',
  is: 'IS',
  in: 'IN',
};

export interface QueryParams {
  select?: string;
  where?: string | string[];
  order?: string;
  limit?: string;
  offset?: string;
}

export interface BuiltQuery {
  selectClause: string;
  whereClause: string;
  orderClause: string;
  limitClause: string;
  values: any[];
}

export function buildQuery(table: string, params: QueryParams): BuiltQuery {
  const values: any[] = [];

  // SELECT
  let selectClause = '*';
  if (params.select) {
    const cols = params.select.split(',').map((c) => c.trim()).filter(Boolean);
    if (cols.length > 0) {
      for (const col of cols) {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
          throw new QueryError(`Invalid column name: ${col}`);
        }
      }
      selectClause = cols.join(', ');
    }
  }

  // WHERE
  let whereClause = '';
  if (params.where) {
    const conditions = Array.isArray(params.where) ? params.where : [params.where];
    const parts: string[] = [];

    for (const cond of conditions) {
      const parsed = parseCondition(cond);
      if (parsed.operator === 'IN') {
        const inValues = parsed.value.split(',');
        const placeholders = inValues.map(() => '?').join(', ');
        parts.push(`${parsed.column} IN (${placeholders})`);
        values.push(...inValues);
      } else if (parsed.value === 'null') {
        parts.push(`${parsed.column} ${parsed.operator === '=' ? 'IS' : 'IS NOT'} NULL`);
      } else {
        parts.push(`${parsed.column} ${parsed.operator} ?`);
        values.push(coerceValue(parsed.value));
      }
    }

    if (parts.length > 0) {
      whereClause = `WHERE ${parts.join(' AND ')}`;
    }
  }

  // ORDER BY
  let orderClause = '';
  if (params.order) {
    const orderParts = params.order.split(',').map((part) => {
      const [col, dir] = part.trim().split('.');
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(col)) {
        throw new QueryError(`Invalid order column: ${col}`);
      }
      const direction = dir?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
      return `${col} ${direction}`;
    });
    orderClause = `ORDER BY ${orderParts.join(', ')}`;
  }

  // LIMIT / OFFSET
  let limitClause = '';
  if (params.limit) {
    const limit = parseInt(params.limit, 10);
    if (isNaN(limit) || limit < 0) throw new QueryError('Invalid limit');
    limitClause = `LIMIT ${limit}`;

    if (params.offset) {
      const offset = parseInt(params.offset, 10);
      if (isNaN(offset) || offset < 0) throw new QueryError('Invalid offset');
      limitClause += ` OFFSET ${offset}`;
    }
  } else {
    limitClause = 'LIMIT 1000';
  }

  return { selectClause, whereClause, orderClause, limitClause, values };
}

function parseCondition(condition: string): {
  column: string;
  operator: string;
  value: string;
} {
  const dotIndex = condition.indexOf('.');
  if (dotIndex === -1) {
    throw new QueryError(`Invalid where condition: ${condition}`);
  }

  const column = condition.slice(0, dotIndex);
  const rest = condition.slice(dotIndex + 1);

  const secondDot = rest.indexOf('.');
  if (secondDot === -1) {
    throw new QueryError(`Invalid where condition: ${condition}`);
  }

  const op = rest.slice(0, secondDot);
  const value = rest.slice(secondDot + 1);

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
    throw new QueryError(`Invalid column name in where: ${column}`);
  }

  const sqlOp = OPERATORS[op];
  if (!sqlOp) {
    throw new QueryError(`Unknown operator: ${op}. Valid: ${Object.keys(OPERATORS).join(', ')}`);
  }

  return { column, operator: sqlOp, value };
}

function coerceValue(value: string): string | number {
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  if (value === 'true') return 1;
  if (value === 'false') return 0;
  return value;
}

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}
