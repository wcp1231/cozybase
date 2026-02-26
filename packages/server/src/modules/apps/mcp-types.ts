/**
 * MCP Tool Type Definitions for CozyBase
 *
 * These types define the input/output interfaces for MCP tools
 * that allow AI Agents to manage CozyBase APPs via the MCP protocol.
 *
 * The actual MCP Server implementation is in a separate change.
 * Tools map to Management API endpoints.
 */

import type { AppState } from '../../core/workspace';

// --- Shared Types ---

export interface McpAppFile {
  path: string;
  content: string;
  immutable: boolean;
}

export interface McpAppInfo {
  name: string;
  description: string;
  current_version: number;
  published_version: number;
  state: AppState | 'unknown';
}

export interface McpAppWithFiles extends McpAppInfo {
  files: McpAppFile[];
}

// --- create_app ---

export interface CreateAppInput {
  name: string;
  description?: string;
}

export interface CreateAppOutput extends McpAppWithFiles {
  api_key: string;
}

// --- list_apps ---

// No input needed
export interface ListAppsOutput {
  apps: McpAppInfo[];
}

// --- fetch_app ---

export interface FetchAppInput {
  app_name: string;
}

export type FetchAppOutput = McpAppWithFiles;

// --- update_app ---

export interface UpdateAppInput {
  app_name: string;
  base_version: number;
  files: { path: string; content: string }[];
}

export type UpdateAppOutput = McpAppWithFiles;

// --- update_app_file ---

/**
 * update_app_file — Update a single file in an APP without a full Checkout-Edit-Push cycle.
 *
 * **UI Definitions (`ui/pages.json`)**:
 * - APP UI definitions are stored in `ui/pages.json`.
 * - `ui/pages.json` uses JSON format with two top-level fields:
 *   - `pages`      — Array of page objects.
 *   - `components` — Optional custom component declarations.
 * - Each page has `id`, `title`, and `body` fields (`id` also serves as the route path segment).
 * - In `body`, components use `type` to specify the component type.
 *   Built-in types: `page`, `row`, `col`, `card`, `tabs`, `divider`,
 *   `table`, `list`, `text`, `heading`, `tag`, `stat`, `form`, `input`,
 *   `textarea`, `number`, `select`, `switch`, `checkbox`, `radio`,
 *   `date-picker`, `button`, `link`, `dialog`, `alert`, `empty`.
 * - Interactions use action declarations. Action types:
 *   `api`, `reload`, `dialog`, `link`, `close`, `confirm`.
 * - API URLs use App-relative paths (e.g. `/db/todo`, `/functions/todos`);
 *   the renderer auto-completes them to full URLs.
 */
export interface UpdateAppFileInput {
  app_name: string;
  path: string;
  content: string;
}

export interface UpdateAppFileOutput {
  path: string;
  content: string;
  immutable: boolean;
}

// --- delete_app ---

export interface DeleteAppInput {
  app_name: string;
}

export interface DeleteAppOutput {
  message: string;
}

// --- MCP Tool Registry Type ---

export interface McpToolDefinition<TInput, TOutput> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: TInput) => Promise<TOutput>;
}

/**
 * Registry of all MCP tools available to AI Agents.
 *
 * **Checkout-Edit-Push workflow**:
 *   1. Checkout — `fetch_app(app_name)` to get the full snapshot.
 *   2. Edit    — Modify files in memory.
 *   3. Push    — `update_app(app_name, base_version, files)`.
 *   4. Reconcile / Verify / Publish — Rebuild draft DB, validate, and publish.
 *
 * **Shortcut — UI-only changes**:
 *   When the Agent only modifies UI definitions (`ui/pages.json`),
 *   Reconcile / Verify / Publish are NOT needed because UI files do not
 *   involve database schema changes. Just call
 *   `update_app_file(app_name, "ui/pages.json", content)` directly.
 */
export type McpToolRegistry = {
  create_app: McpToolDefinition<CreateAppInput, CreateAppOutput>;
  list_apps: McpToolDefinition<Record<string, never>, ListAppsOutput>;
  fetch_app: McpToolDefinition<FetchAppInput, FetchAppOutput>;
  update_app: McpToolDefinition<UpdateAppInput, UpdateAppOutput>;
  update_app_file: McpToolDefinition<UpdateAppFileInput, UpdateAppFileOutput>;
  delete_app: McpToolDefinition<DeleteAppInput, DeleteAppOutput>;
};

// --- Tool Descriptions (for MCP Server registration) ---

/**
 * Pre-defined description strings for each MCP tool.
 * These will be passed to MCP clients so that AI Agents understand
 * what each tool does and how to use it correctly.
 */
export const TOOL_DESCRIPTIONS: Record<keyof McpToolRegistry, string> = {
  create_app: 'Create a new APP. Returns the full file snapshot and an API key.',

  list_apps: 'List all APPs with their basic info (name, description, state, versions).',

  fetch_app:
    'Fetch the full snapshot of an APP including all files and current_version. ' +
    'This is the "Checkout" step of the Checkout-Edit-Push workflow.',

  update_app:
    'Push a batch of file changes to an APP with optimistic locking (base_version). ' +
    'This is the "Push" step of the Checkout-Edit-Push workflow. ' +
    'After pushing, run reconcile → verify → publish to apply schema changes.',

  update_app_file:
    'Update a single file in an APP. No base_version needed. ' +
    'Ideal for quick edits without a full Checkout-Edit-Push cycle.\n\n' +
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
    'API URLs use App-relative paths (e.g. `/db/todo`, `/functions/todos`); ' +
    'the renderer auto-completes them to full URLs.\n\n' +
    '**When only modifying `ui/pages.json`, reconcile / verify / publish are NOT needed.** ' +
    'Just call `update_app_file(app_name, "ui/pages.json", content)` directly.',

  delete_app: 'Delete an APP and all its associated data.',
};
