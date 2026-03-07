/**
 * MCP Tool Type Definitions for CozyBase
 *
 * These types define the input/output interfaces for MCP tools
 * that allow AI Agents to manage CozyBase APPs via the MCP protocol.
 *
 * Architecture: Agent reads/writes files in a local working directory,
 * MCP tools sync between the working directory and cozybase core.
 */

import type { StableStatus } from '../../core/workspace';
import type { BatchOperation, BatchResult } from './page-editor';

// --- Tool Input / Output Types ---

// -- create_app --

export interface CreateAppInput {
  name: string;
  description?: string;
  display_name?: string;
}

export interface CreateAppOutput {
  slug: string;
  displayName: string;
  description: string;
  directory: string;
  files: string[];
}

// -- list_apps --

export interface ListAppsOutput {
  apps: {
    slug: string;
    displayName: string;
    description: string;
    stableStatus: StableStatus | null;
    hasDraft: boolean;
    current_version: number;
    published_version: number;
  }[];
}

// -- fetch_app --

export interface FetchAppInput {
  app_name: string;
}

export interface FetchAppOutput {
  slug: string;
  displayName: string;
  description: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
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
  needs_rebuild: boolean;
}

// -- update_app_file --

export interface UpdateAppFileInput {
  app_name: string;
  path: string;
}

export interface UpdateAppFileOutput {
  path: string;
  status: 'created' | 'updated';
  needs_rebuild: boolean;
}

// -- delete_app --

export interface DeleteAppInput {
  app_name: string;
}

export interface DeleteAppOutput {
  message: string;
}

// -- start_app --

export interface StartAppInput {
  app_name: string;
}

export interface StartAppOutput {
  slug: string;
  displayName: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
}

// -- stop_app --

export interface StopAppInput {
  app_name: string;
}

export interface StopAppOutput {
  slug: string;
  displayName: string;
  stableStatus: StableStatus | null;
  hasDraft: boolean;
  current_version: number;
  published_version: number;
}

// -- rebuild_app --

export interface RebuildAppInput {
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

// -- get_app_console --

export interface GetAppConsoleInput {
  app_name: string;
  mode?: 'draft' | 'stable';
}

// -- get_app_errors --

export interface GetAppErrorsInput {
  app_name: string;
  mode?: 'draft' | 'stable';
  limit?: number;
  offset?: number;
  source_type?: 'http_function' | 'schedule' | 'build';
}

// -- ui_outline --

export interface UiOutlineInput {
  app_name: string;
  page_path?: string;
}

// -- ui_get --

export interface UiGetInput {
  app_name: string;
  node_id: string;
}

// -- ui_insert --

export interface UiInsertInput {
  app_name: string;
  parent_id: string;
  node: Record<string, unknown>;
  index?: number;
}

// -- ui_update --

export interface UiUpdateInput {
  app_name: string;
  node_id: string;
  props: Record<string, unknown>;
}

// -- ui_move --

export interface UiMoveInput {
  app_name: string;
  node_id: string;
  new_parent_id: string;
  index?: number;
}

// -- ui_delete --

export interface UiDeleteInput {
  app_name: string;
  node_id: string;
}

// -- ui_batch --

export interface UiBatchInput {
  app_name: string;
  operations: BatchOperation[];
}

export type UiBatchOutput = BatchResult;

// -- pages_list --

export interface PagesListInput {
  app_name: string;
}

// -- pages_add --

export interface PagesAddInput {
  app_name: string;
  path: string;
  title: string;
  index?: number;
}

// -- pages_remove --

export interface PagesRemoveInput {
  app_name: string;
  page_path: string;
}

// -- pages_update --

export interface PagesUpdateInput {
  app_name: string;
  page_path: string;
  title: string;
}

// -- pages_reorder --

export interface PagesReorderInput {
  app_name: string;
  page_path: string;
  index: number;
}

// --- Tool Descriptions (for MCP Server registration) ---

export const TOOL_DESCRIPTIONS = {
  create_app:
    'Create a new APP. Template files will be written to the Agent working directory.\n\n' +
    'After creation, use your file tools to read and edit the files in the returned `directory`.\n' +
    'When done editing, call `update_app` to sync changes back to cozybase.\n\n' +
    'For the complete development workflow, call `get_guide("workflow")`.',

  list_apps:
    'List all APPs with their basic info (slug, displayName, description, stableStatus, hasDraft, versions).',

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
    'The result includes `needs_rebuild`.\n' +
    'Call `rebuild_app` only when `needs_rebuild` is `true` ' +
    '(for example after changing migrations, seeds, `package.json`, or `app.yaml`).',

  update_app_file:
    'Sync a single file from the Agent working directory to cozybase.\n\n' +
    'Use this for quick single-file updates instead of full `update_app`.\n' +
    'The result includes `needs_rebuild` so you know whether `rebuild_app` is still required.\n\n' +
    'For UI component reference, call `get_guide("ui/components")`.',

  delete_app:
    'Delete an APP and all its associated data. This also removes the Agent working directory.\n\n' +
    'Only APPs whose Stable version is `stopped` or has never been published can be deleted.\n\n' +
    '**WARNING: This operation is irreversible. All data will be permanently deleted.**',

  start_app:
    'Start an APP\'s Stable runtime.\n\n' +
    'The APP must already have a Stable version, and a stopped Stable version will transition to `running`.',

  stop_app:
    'Stop an APP\'s Stable runtime.\n\n' +
    'The APP must already have a Stable version, and a running Stable version will transition to `stopped`.',

  rebuild_app:
    'Rebuild the Draft environment for an APP.\n\n' +
    'This destroys and recreates the Draft database by executing all migrations, ' +
    'loading seed data, installing dependencies when `package.json` exists, ' +
    'reloading Draft config, and refreshing exported runtime files.\n\n' +
    'Call this after `update_app` or `update_app_file` only when you\'ve changed ' +
    'migrations, seeds, `package.json`, or `app.yaml`, or when `needs_rebuild` is `true`.\n\n' +
    'For migration patterns, call `get_guide("db/migrations")`.',

  verify_app:
    'Verify that Draft changes can be safely published to Stable.\n\n' +
    'This is a **required step before `publish_app`**. It validates that all changes ' +
    '(migrations, functions, UI) can be correctly applied to the Stable environment.\n\n' +
    'For the complete development workflow, call `get_guide("workflow")`.',

  publish_app:
    'Publish Draft changes to Stable. **This is the FINAL step in the development workflow.**\n\n' +
    'This applies pending migrations to the Stable database, exports functions, ' +
    'and marks executed migrations as immutable.\n\n' +
    'Requires `verify_app` to pass first. Do NOT call automatically — always get user confirmation first.\n\n' +
    'For the complete development workflow, call `get_guide("workflow")`.',

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

  get_app_console:
    'Get a compact diagnostic overview for an APP Console.\n\n' +
    'Returns APP runtime status, a 24-hour error summary, and schedule health summary.\n' +
    'Use this first when investigating whether an APP is failing before requesting full error details.\n\n' +
    'Default mode is `stable`.',

  get_app_errors:
    'Get detailed APP error records, including stack traces when available.\n\n' +
    'Supports pagination via `limit` and `offset`, and filtering by `source_type` (`http_function`, `schedule`, `build`).\n' +
    'Use this after `get_app_console` when you need the actual error payloads.\n\n' +
    'Default mode is `stable`. Default limit is `10`; default offset is `0`.',

  get_guide:
    'Get detailed reference documentation for APP development.\n\n' +
    'Use this tool when you need in-depth information about a specific topic ' +
    'beyond what tool descriptions provide.\n\n' +
    '**Available topics:**\n' +
    '- `workflow` — Complete development lifecycle (get source → edit → upload → rebuild as needed → test → verify → publish)\n' +
    '- `functions` — Writing TypeScript functions (FunctionContext API, exports, return values)\n' +
    '- `scheduled-tasks` — Cron schedule config in `app.yaml`, runtime behavior, and trigger endpoints\n' +
    '- `ui` — UI system overview (pages, components, actions, expressions)\n' +
    '  - `ui/batch` — Batch page/component editing patterns, refs, and examples\n' +
    '  - `ui/components` — Component quick-reference (26 built-in types)\n' +
    '  - `ui/components/<name>` — Individual component docs (e.g. `ui/components/table`)\n' +
    '  - `ui/actions` — Action system (api, reload, dialog, link, close, confirm)\n' +
    '  - `ui/expressions` — Expression engine (`${...}` syntax, scopes)\n' +
    '- `db` — Database overview\n' +
    '  - `db/crud` — Database REST API reference (paths, query params, operators)\n' +
    '  - `db/migrations` — Migration patterns (SQLite syntax, naming, immutable mechanism)\n\n' +
    'Use `/` to drill into subtopics (e.g. `get_guide("ui/components/table")`).',

  inspect_ui:
    'Inspect the rendered UI of a draft APP in the browser.\n\n' +
    'Returns a structured tree of visible components with their text content, ' +
    'table data (columns, row count, first 5 rows), form state (fields, values), ' +
    'and available actions.\n\n' +
    '**Requirements:**\n' +
    '- Web UI must be open in a browser with the target APP loaded\n' +
    '- The APP must have a Draft with UI pages\n' +
    '- Run `rebuild_app` first only if the preceding file update returned `needs_rebuild: true`\n\n' +
    'Use this after updating UI files and, when necessary, rebuilding to verify the UI renders correctly.\n' +
    'If no browser is connected, an error message will explain what to do.',

  ui_outline:
    'Get a structural outline of `ui/pages.json` from the Agent working copy.\n\n' +
    'Returns a tree with page paths, component IDs, types, and short summaries.\n' +
    'Use this to understand the page structure before making targeted edits.\n\n' +
    '**Workflow:**\n' +
    '1. Call `fetch_app` to populate the working copy\n' +
    '2. Call `ui_outline` to see the page structure\n' +
    '3. Use the node IDs returned here to call `ui_get`, `ui_insert`, etc.\n\n' +
    'Changes made by ui tools only affect the working copy.\n' +
    'Call `update_app_file` with path `ui/pages.json` to sync back to cozybase.',

  ui_get:
    'Get the full schema details of a specific component node by its stable ID.\n\n' +
    'Use node IDs returned by `ui_outline` or previous ui tool calls.',

  ui_insert:
    'Insert a new component node into a parent container in `ui/pages.json`.\n\n' +
    'The system auto-generates a stable ID for the new node.\n' +
    'Use nested `"$self"` in `node` when a nested field must reference the inserted node\'s generated ID.\n' +
    'Returns the inserted node including its generated ID.\n\n' +
    '**Prefer `ui_batch` for related multi-step edits** to reduce round trips and keep dependent operations in one call.\n\n' +
    '**Note:** Only container types (`page`, `row`, `col`, `card`, `dialog`) can receive children.\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  ui_update:
    'Update properties of an existing component node in `ui/pages.json`.\n\n' +
    '**Prefer `ui_batch` when this update is part of a larger edit sequence.**\n\n' +
    '**Restrictions:**\n' +
    '- Cannot modify `id` (stable, system-managed)\n' +
    '- Cannot modify `type` (use ui_delete + ui_insert to replace a node)\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  ui_move:
    'Move a component node (and its subtree) to a new parent container.\n\n' +
    '**Prefer `ui_batch` when combining move with other edits.**\n\n' +
    'Node IDs are preserved after the move.\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  ui_delete:
    'Delete a component node and its entire subtree from `ui/pages.json`.\n\n' +
    '**Prefer `ui_batch` when delete is part of a larger change set.**\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  ui_batch:
    'Preferred UI editing tool for multi-step changes in `ui/pages.json`.\n\n' +
    'Execute multiple page/component operations in one `ui/pages.json` round trip.\n\n' +
    'Supports mixed operations: `get`, `insert`, `update`, `delete`, `move`, `page_add`, `page_remove`, `page_update`.\n' +
    'Operations run in order and return per-operation statuses (`ok`, `error`, `skipped`).\n\n' +
    'Use `ref` (must start with `$`) to bind IDs from earlier operations, then reference them via `$ref` in later operations.\n' +
    'When an operation fails, unrelated operations continue; dependent `$ref` operations are marked `skipped`.\n' +
    'A batch writes `ui/pages.json` once only if at least one write operation succeeds.\n\n' +
    'Operations:\n' +
    '- get: { node_id }\n' +
    '- insert: { parent_id, node, index? }\n' +
    '- update: { node_id, props }\n' +
    '- delete: { node_id }\n' +
    '- move: { node_id, new_parent_id, index? }\n' +
    '- page_add: { id, title, index? }\n' +
    '- page_remove: { page_id }\n' +
    '- page_update: { page_id, title }\n\n' +
    'All ops accept optional `ref` (must start with `$`).\n' +
    'Refs resolve in top-level operation fields and also in nested exact-match string values inside `insert.node` and `update.props`.\n' +
    'Use `"$self"` inside `insert.node` to reference the inserted node\'s generated ID; unresolved nested refs raise a validation error.\n' +
    'Insert always generates a fresh component ID and ignores any caller-provided `id`.\n' +
    'Cannot modify `id` or `type` via update (use delete + insert).\n' +
    'Call `get_guide("ui/batch")` for examples.',

  pages_list:
    'List all pages in `ui/pages.json` with their path and title.\n\n' +
    'Use this to see which pages exist before adding, removing, or reordering them.\n\n' +
    'Call `fetch_app` first to populate the working copy.',

  pages_add:
    'Add a new page to `ui/pages.json`.\n\n' +
    'The page `path` is a route pattern (e.g., `orders`, `orders/:orderId`, `orders/:orderId/refund`).\n' +
    '**path format:** slash-separated lowercase static segments and `:param` segments.\n' +
    'The page is created with an empty body; use `ui_insert` to add components.\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  pages_remove:
    'Remove a page and all its components from `ui/pages.json`.\n\n' +
    '**Warning:** This permanently deletes the page and all its components.\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  pages_update:
    'Update the title of an existing page in `ui/pages.json`.\n\n' +
    '**Note:** Page `path` cannot be changed.\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',

  pages_reorder:
    'Move a page to a new position in the pages list.\n\n' +
    'The page order determines route matching precedence and top-level navigation order.\n' +
    '`index` is 0-based (0 = first position).\n\n' +
    'After editing, call `update_app_file` with path `ui/pages.json` to sync to cozybase.',
} as const;

// --- Input Schemas (for MCP Server tool registration) ---

export const INPUT_SCHEMAS = {
  create_app: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'APP slug — URL-safe identifier (alphanumeric, hyphens, underscores)' },
      description: { type: 'string', description: 'APP description (optional)' },
      display_name: { type: 'string', description: 'Human-friendly display name (supports unicode). Defaults to slug if omitted.' },
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
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  update_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  update_app_file: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
      path: { type: 'string', description: 'File path relative to APP directory (e.g. "functions/hello.ts")' },
    },
    required: ['app_name', 'path'],
  },

  delete_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  start_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  stop_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  rebuild_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  verify_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  publish_app: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
    },
    required: ['app_name'],
  },

  execute_sql: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
      sql: { type: 'string', description: 'SQL statement to execute' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'Database mode (default: draft)' },
    },
    required: ['app_name', 'sql'],
  },

  call_api: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
      method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
      path: { type: 'string', description: 'API path (e.g. /fn/_db/tables/tasks, /fn/hello)' },
      body: { description: 'Request body (optional, for POST/PUT)' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'App mode (default: draft)' },
    },
    required: ['app_name', 'method', 'path'],
  },

  get_app_console: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'Runtime mode. Defaults to stable.' },
    },
    required: ['app_name'],
  },

  get_app_errors: {
    type: 'object' as const,
    properties: {
      app_name: { type: 'string', description: 'APP slug' },
      mode: { type: 'string', enum: ['draft', 'stable'], description: 'Runtime mode. Defaults to stable.' },
      limit: { type: 'number', description: 'Maximum number of errors to return. Defaults to 10.' },
      offset: { type: 'number', description: 'Number of errors to skip before returning results. Defaults to 0.' },
      source_type: {
        type: 'string',
        enum: ['http_function', 'schedule', 'build'],
        description: 'Optional error source filter.',
      },
    },
    required: ['app_name'],
  },
} as const;
