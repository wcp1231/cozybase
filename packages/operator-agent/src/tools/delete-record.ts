import { Type } from '@sinclair/typebox';
import { callJsonApi } from '../http';
import type { CallApiFn } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { bindAction } from './shared';

const DeleteRecordSchema = Type.Object({
  table: Type.String({ minLength: 1 }),
  id: Type.String({ minLength: 1 }),
});

export const deleteRecordAction: OperatorActionDefinition<typeof DeleteRecordSchema> = {
  name: 'delete_record',
  description: '删除指定数据表中的一条记录。调用前应确认用户明确允许删除。',
  schema: DeleteRecordSchema,
  async execute({ callApi }, input) {
    await callJsonApi(
      callApi,
      `_db/tables/${encodeURIComponent(input.table)}/${encodeURIComponent(input.id)}`,
      {
        method: 'DELETE',
      },
    );
    return { success: true };
  },
};

export function createDeleteRecordTool(callApi: CallApiFn) {
  return bindAction(deleteRecordAction, callApi);
}
