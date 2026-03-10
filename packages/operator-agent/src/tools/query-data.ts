import { Type } from '@sinclair/typebox';
import { buildQueryString, callJsonApi } from '../http';
import type { CallApiFn } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { bindAction } from './shared';

const QueryDataSchema = Type.Object({
  table: Type.String({ minLength: 1 }),
  where: Type.Optional(Type.String()),
  select: Type.Optional(Type.String()),
  order: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
});

export const queryDataAction: OperatorActionDefinition<typeof QueryDataSchema> = {
  name: 'query_data',
  description: '查询某张表中的记录，可指定过滤、字段、排序和数量限制。',
  schema: QueryDataSchema,
  async execute({ callApi }, input) {
    const query = buildQueryString({
      where: normalizeWhereCondition(input.where),
      select: input.select,
      order: input.order,
      limit: input.limit,
    });
    const result = await callJsonApi<{
      data: unknown[];
      meta?: { total?: number; limit?: number; offset?: number };
    } | unknown[]>(
      callApi,
      `_db/tables/${encodeURIComponent(input.table)}${query}`,
    );

    if (Array.isArray(result)) {
      return { records: result };
    }

    return {
      records: Array.isArray(result.data) ? result.data : [],
      meta: result.meta ?? null,
    };
  },
};

export function createQueryDataTool(callApi: CallApiFn) {
  return bindAction(queryDataAction, callApi);
}

function normalizeWhereCondition(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return value;
  }

  if (/^[A-Za-z_][\w.]*=(eq|neq|gt|gte|lt|lte|like|ilike|in|is)\./.test(trimmed)) {
    return trimmed;
  }

  const match = trimmed.match(/^([A-Za-z_][\w.]*)\s*=\s*(.+)$/s);
  if (!match) {
    return trimmed;
  }

  const [, field, rawValue] = match;
  const normalizedValue = normalizeEqualityValue(rawValue.trim());
  return normalizedValue === null ? trimmed : `${field}=eq.${normalizedValue}`;
}

function normalizeEqualityValue(rawValue: string): string | null {
  const quoted = rawValue.match(/^'(.*)'$/s) ?? rawValue.match(/^"(.*)"$/s);
  if (quoted) {
    return quoted[1] ?? '';
  }

  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return rawValue;
  }

  if (/^(true|false|null)$/i.test(rawValue)) {
    return rawValue.toLowerCase();
  }

  return null;
}
