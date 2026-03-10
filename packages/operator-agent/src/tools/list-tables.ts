import { Type } from '@sinclair/typebox';
import { callJsonApi, normalizeRuntimeSchema } from '../http';
import type { OperatorActionDefinition } from '../actions';
import type { CallApiFn } from '../types';
import { bindAction } from './shared';

const EmptySchema = Type.Object({});

export const listTablesAction: OperatorActionDefinition<typeof EmptySchema> = {
  name: 'list_tables',
  description: '列出当前 APP 的所有数据表以及列定义。',
  schema: EmptySchema,
  async execute({ callApi }) {
    const schema = await callJsonApi<Record<string, { columns?: Array<Record<string, unknown>> }>>(
      callApi,
      '_db/schemas',
    );
    return {
      tables: normalizeRuntimeSchema(schema),
    };
  },
};

export function createListTablesTool(callApi: CallApiFn) {
  return bindAction(listTablesAction, callApi);
}
