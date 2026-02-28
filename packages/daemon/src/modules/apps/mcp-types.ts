/**
 * MCP Tool Type Definitions for CozyBase
 *
 * These types define the input/output interfaces for 11 MCP tools
 * that allow AI Agents to manage CozyBase APPs via the MCP protocol.
 *
 * Architecture: Agent reads/writes files in a local working directory,
 * MCP tools sync between the working directory and cozybase core.
 */

import type { AppState } from '../../core/workspace';

// --- Tool Input / Output Types ---

// -- create_app --

export interface CreateAppInput {
  name: string;
  description?: string;
}

export interface CreateAppOutput {
  name: string;
  description: string;
  directory: string;
  files: string[];
}

// -- list_apps --

export interface ListAppsOutput {
  apps: {
    name: string;
    description: string;
    state: AppState | 'unknown';
    current_version: number;
    published_version: number;
  }[];
}

// -- fetch_app --

export interface FetchAppInput {
  app_name: string;
}

export interface FetchAppOutput {
  name: string;
  description: string;
  state: AppState | 'unknown';
  current_version: number;
  published_version: number;
  directory: string;
  files: string[];
}

// -- update_app --

export interface UpdateAppInput {
  app_name: string;
}

export interface UpdateAppOutput {
  files: string[];
  changes: {
    added: string[];
    modified: string[];
    deleted: string[];
  };
}

// -- update_app_file --

export interface UpdateAppFileInput {
  app_name: string;
  path: string;
}

export interface UpdateAppFileOutput {
  path: string;
  status: 'created' | 'updated';
}

// -- delete_app --

export interface DeleteAppInput {
  app_name: string;
}

export interface DeleteAppOutput {
  message: string;
}

// -- reconcile_app --

export interface ReconcileAppInput {
  app_name: string;
}

// -- verify_app --

export interface VerifyAppInput {
  app_name: string;
}

// -- publish_app --

export interface PublishAppInput {
  app_name: string;
}

// -- execute_sql --

export interface ExecuteSqlInput {
  app_name: string;
  sql: string;
  mode?: 'draft' | 'stable';
}

export interface ExecuteSqlOutput {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

// -- call_api --

export interface CallApiInput {
  app_name: string;
  method: string;
  path: string;
  body?: unknown;
  mode?: 'draft' | 'stable';
}

export interface CallApiOutput {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

// --- Tool Descriptions (for MCP Server registration) ---

export const TOOL_DESCRIPTIONS = {
  create_app:
    'Create a new APP. Template files will be written to the Agent working directory.\n\n' +
    'After creation, use your file tools to read and edit the files in the returned `directory`.\n' +
    'When done editing, call `update_app` to sync changes back to cozybase.',

  list_apps:
    'List all APPs with their basic info (name, description, state, versions).',

  fetch_app:
    'Fetch an APP from cozybase and write all files to the Agent working directory.\n\n' +
    'This replaces the working directory contents with the latest state from cozybase.\n' +
    'Use your file tools to read the files in the returned `directory`.',

  update_app:
    'Sync all files from the Agent working directory to cozybase (full sync).\n\n' +
    'This scans the APP directory and pushes all changes:\n' +
    '- New files are added\n' +
    '- Modified files are updated\n' +
    '- Missing files are deleted (except immutable migrations)\n\n' +
    'After syncing, run `reconcile_app` to rebuild the Draft environment.\n' +
    '**Important**: Always call this after editing files, before reconcile/verify/publish.',

  update_app_file:
    'Sync a single file from the Agent working directory to cozybase.\n\n' +
    'Use this for quick single-file updates instead of full `update_app`.\n\n' +
    '## UI Definitions (`ui/pages.json`)\n\n' +
    'APP UI definitions are stored in `ui/pages.json`. ' +
    'The file uses JSON format with two top-level fields:\n' +
    '- `pages` — Array of page objects.\n' +
    '- `components` — Optional custom component declarations.\n\n' +
    'Each page has `id`, `title`, and `body` fields (`id` also serves as the route path segment).\n\n' +
    'In `body`, components use `type` to specify the component type. ' +
    'Built-in types: page, row, col, card, tabs, divider, table, list, ' +
    'text, heading, tag, stat, form, input, textarea, number, select, ' +
    'switch, checkbox, radio, date-picker, button, link, dialog, alert, empty.\n\n' +
    'Interactions use action declarations. Action types: ' +
    'api, reload, dialog, link, close, confirm.\n\n' +
    'API URLs use App-relative paths (e.g. `/fn/_db/tables/todo`, `/fn/todos`); ' +
    'the renderer auto-completes them to full URLs.\n\n',

  delete_app:
    'Delete an APP and all its associated data. This also removes the Agent working directory.\n\n' +
    '**WARNING: This operation is irreversible. All data will be permanently deleted.**',

  reconcile_app:
    'Rebuild the Draft environment for an APP.\n\n' +
    'This destroys and recreates the Draft database by executing all migrations, ' +
    'loading seed data, and exporting functions to the runtime directory.\n\n' +
    'Call this after `update_app` or `update_app_file` when you\'ve changed ' +
    'migrations, seeds, or functions.',

  verify_app:
    'Verify that Draft changes can be safely published to Stable.\n\n' +
    'This checks migration compatibility by dry-running pending migrations ' +
    'against a copy of the Stable database.',

  publish_app:
    'Publish Draft changes to Stable.\n\n' +
    'This applies pending migrations to the Stable database, exports functions, ' +
    'and marks executed migrations as immutable.\n\n' +
    'Run `verify_app` first to ensure changes are safe to publish.',

  execute_sql:
    'Execute a SQL query on an APP\'s database.\n\n' +
    '**Permission model:**\n' +
    '- Draft mode: SELECT and DML (INSERT/UPDATE/DELETE) allowed\n' +
    '- Stable mode: SELECT only\n' +
    '- DDL (CREATE/DROP/ALTER) is always forbidden — use migration files instead\n\n' +
    'Returns columns, rows, and rowCount. Maximum 1000 rows returned.\n' +
    'Default mode is `draft`.',

  call_api:
    'Call an APP\'s HTTP endpoint (user perspective).\n\n' +
    'Covers all APP endpoints:\n' +
    '- Database REST API: `/fn/_db/tables/{table}` and `/fn/_db/tables/{table}/{id}`\n' +
    '- TypeScript functions: ANY `/fn/{name}`\n\n' +
    'Default mode is `draft`.',
} as const;

// --- Input Schemas (for MCP Server tool registration) ---

export const INPUT_SCHEMAS = {
  create_app: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'APP name (alphanumeric, hyphens, underscores)' },
      description: { type: 'string', description: 'APP description (optional)' },
    },
    required: ['name'],
  },

  list_apps: {
    type: 'object' as const,
    properties: {},
  },

  fetch_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  update_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  update_app_file: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
      path: { type: 'string', description: 'File path relative to APP directory (e.g. "functions/hello.ts")' },
    },
    required: ['app_name', 'path'],
  },

  delete_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  reconcile_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  verify_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  publish_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
    },
    required: ['app_name'],
  },

  execute_sql: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
      sql: { type: 'string', description: 'SQL statement to execute' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'Database mode (default: draft)' },
    },
    required: ['app_name', 'sql'],
  },

  call_api: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP name' },
      method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
      path: { type: 'string', description: 'API path (e.g. /fn/_db/tables/tasks, /fn/hello)' },
      body: { description: 'Request body (optional, for POST/PUT)' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'App mode (default: draft)' },
    },
    required: ['app_name', 'method', 'path'],
  },
} as const;
