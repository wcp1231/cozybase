import { Type } from '@sinclair/typebox';
import { callJsonApi } from '../http';
import type { CallApiFn } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { bindAction } from './shared';

const CreateRecordSchema = Type.Object({
  table: Type.String({ minLength: 1 }),
  data: Type.Record(Type.String(), Type.Any()),
});

export const createRecordAction: OperatorActionDefinition<typeof CreateRecordSchema> = {
  name: 'create_record',
  description: '向指定数据表中创建一条新记录。',
  schema: CreateRecordSchema,
  async execute({ callApi }, input) {
    const record = await callJsonApi(
      callApi,
      `_db/tables/${encodeURIComponent(input.table)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(input.data),
      },
    );
    return { record };
  },
};

export function createCreateRecordTool(callApi: CallApiFn) {
  return bindAction(createRecordAction, callApi);
}
