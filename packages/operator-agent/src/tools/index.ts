import type { CallApiFn, OperatorToolSet } from '../types';
import type { OperatorActionDefinition } from '../actions';
import { createCallFunctionTool } from './call-function';
import { createCreateRecordTool } from './create-record';
import { createDeleteRecordTool } from './delete-record';
import { createListTablesTool } from './list-tables';
import { createQueryDataTool } from './query-data';
import { createUpdateRecordTool } from './update-record';
import { callFunctionAction } from './call-function';
import { createRecordAction } from './create-record';
import { deleteRecordAction } from './delete-record';
import { listTablesAction } from './list-tables';
import { queryDataAction } from './query-data';
import { updateRecordAction } from './update-record';

export {
  callFunctionAction,
  createRecordAction,
  createCallFunctionTool,
  createCreateRecordTool,
  createDeleteRecordTool,
  createListTablesTool,
  createQueryDataTool,
  createUpdateRecordTool,
  deleteRecordAction,
  listTablesAction,
  queryDataAction,
  updateRecordAction,
};

export function getOperatorActions(): OperatorActionDefinition[] {
  return [
    listTablesAction,
    queryDataAction,
    createRecordAction,
    updateRecordAction,
    deleteRecordAction,
    callFunctionAction,
  ];
}

export function createOperatorTools(callApi: CallApiFn) {
  return getOperatorActions().map((action) => ({
    ...action,
    execute: (input: unknown) => action.execute({ callApi }, input as never),
  }));
}

export function createOperatorToolSet(callApi: CallApiFn): OperatorToolSet {
  return {
    listTables: createListTablesTool(callApi),
    queryData: createQueryDataTool(callApi),
    createRecord: createCreateRecordTool(callApi),
    updateRecord: createUpdateRecordTool(callApi),
    deleteRecord: createDeleteRecordTool(callApi),
    callFunction: createCallFunctionTool(callApi),
  };
}
