export type CallApiFn = (path: string, options?: RequestInit) => Promise<Response>;

export interface AppTableColumn {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
}

export interface AppTableSchema {
  name: string;
  columns: AppTableColumn[];
}

export interface AppFunctionDefinition {
  name: string;
  methods: string[];
}

export interface AppContext {
  displayName: string;
  description?: string;
  schema: AppTableSchema[];
  functions: AppFunctionDefinition[];
}

export interface OperatorToolSet {
  listTables: unknown;
  queryData: unknown;
  createRecord: unknown;
  updateRecord: unknown;
  deleteRecord: unknown;
  callFunction: unknown;
}
