import type { Static, TSchema } from '@sinclair/typebox';
import type { AppTableColumn, AppTableSchema, CallApiFn } from './types';

interface RuntimeSchemaColumn {
  name?: string;
  type?: string;
  pk?: number;
  notnull?: number;
}

interface RuntimeSchemaTable {
  columns?: RuntimeSchemaColumn[];
}

function buildErrorMessage(
  path: string,
  options: RequestInit | undefined,
  status: number,
  payload: unknown,
  fallback: string,
): string {
  const error = payload && typeof payload === 'object'
    ? (payload as { error?: { code?: string; message?: string } }).error
    : undefined;
  const code = typeof error?.code === 'string' ? error.code : null;
  const message = typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallback;
  const detail = code ? `HTTP ${status} ${code}: ${message}` : `HTTP ${status}: ${message}`;
  const hint = buildErrorHint(path, options?.method, status, code, message);

  return hint ? `${detail} Hint: ${hint}` : detail;
}

function buildErrorHint(
  path: string,
  method: string | undefined,
  status: number,
  code: string | null,
  message: string,
): string | null {
  const normalizedPath = path.replace(/^\/+/, '');
  const normalizedMethod = (method ?? 'GET').toUpperCase();

  if (normalizedPath.startsWith('_db/tables/')) {
    if (normalizedMethod === 'POST' && message.includes('at least one field')) {
      return 'Pass a non-empty data object with concrete column values, for example {"title":"Buy milk"}';
    }
    if (message.includes('does not exist')) {
      return 'Use a table name from the current schema and check that all referenced columns exist';
    }
    if (status === 404 && message.includes('Record not found')) {
      return 'Query the table first and use an existing primary-key value before updating or deleting';
    }
    if (code === 'BAD_REQUEST') {
      return 'Check that the table name, field names, and field value types match the current schema';
    }
  }

  if (status === 404 && message.includes('Function') && message.includes('not found')) {
    return 'Use the published function name from the prompt. The name may be passed as "send-email" or "/fn/send-email"';
  }

  if (status === 405 && message.includes('Method')) {
    return 'Call the function with an exported HTTP method such as GET, POST, PUT, PATCH, or DELETE';
  }

  return null;
}

export async function callJsonApi<T = unknown>(
  callApi: CallApiFn,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const { payload } = await callJsonApiDetailed<T>(callApi, path, options);
  return payload;
}

export async function callJsonApiDetailed<T = unknown>(
  callApi: CallApiFn,
  path: string,
  options?: RequestInit,
): Promise<{ status: number; payload: T }> {
  const response = await callApi(path, options);
  const text = await response.text();
  const payload = text ? safeJsonParse(text) : null;

  if (!response.ok) {
    throw new Error(buildErrorMessage(path, options, response.status, payload, response.statusText || 'Request failed'));
  }

  if (payload && typeof payload === 'object' && 'data' in payload) {
    return {
      status: response.status,
      payload: (payload as { data: T }).data,
    };
  }

  return {
    status: response.status,
    payload: payload as T,
  };
}

export function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function buildQueryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === '') {
      continue;
    }
    query.append(key, String(value));
  }

  const built = query.toString();
  return built ? `?${built}` : '';
}

export function normalizeRuntimeSchema(schema: Record<string, RuntimeSchemaTable>): AppTableSchema[] {
  return Object.entries(schema).map(([tableName, table]) => ({
    name: tableName,
    columns: Array.isArray(table.columns)
      ? table.columns.map(normalizeRuntimeColumn)
      : [],
  }));
}

function normalizeRuntimeColumn(column: RuntimeSchemaColumn): AppTableColumn {
  return {
    name: column.name ?? '',
    type: column.type ?? 'TEXT',
    primaryKey: column.pk === 1,
    notNull: column.notnull === 1,
  };
}

export type SchemaInput<T extends TSchema> = Static<T>;
