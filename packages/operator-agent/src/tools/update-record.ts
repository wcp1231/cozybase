import { Type } from '@sinclair/typebox';
import { callJsonApi } from '../http';
import type { CallApiFn } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { bindAction } from './shared';

const UpdateRecordSchema = Type.Object({
  table: Type.String({ minLength: 1 }),
  id: Type.String({ minLength: 1 }),
  data: Type.Record(Type.String(), Type.Any()),
});

export const updateRecordAction: OperatorActionDefinition<typeof UpdateRecordSchema> = {
  name: 'update_record',
  description: '更新指定数据表中某条记录的字段。',
  schema: UpdateRecordSchema,
  async execute({ callApi }, input) {
    const record = await callJsonApi(
      callApi,
      `_db/tables/${encodeURIComponent(input.table)}/${encodeURIComponent(input.id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.data),
      },
    );
    return { record };
  },
};

export function createUpdateRecordTool(callApi: CallApiFn) {
  return bindAction(updateRecordAction, callApi);
}
