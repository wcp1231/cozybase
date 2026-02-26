# Cozybase

Local BaaS (Backend as a Service) platform for AI Agents. Built with TypeScript, Bun, and SQLite.

Cozybase runs as a daemon process, manages a self-contained workspace, and supports a migration-based development workflow with Stable/Draft dual-version model. All app definitions are stored in a central Platform DB and managed through a unified Management API — no Git dependency, no filesystem-as-source-of-truth.

```
Workspace (~/.cozybase)
┌──────────────────────────────────────────────────────────┐
│ workspace.yaml              ← config (name+version)      │
│                                                          │
│ data/                                                    │
│ ├── platform.sqlite         ← Source of Truth            │
│ │   ├── apps table            (name, version, status)    │
│ │   ├── app_files table       (migrations, functions,    │
│ │   │                          seeds, ui, config)        │
│ │   └── api_keys table                                   │
│ ├── apps/                                                │
│ │   ├── todo-app/                                        │
│ │   │   ├── db.sqlite       ← Stable DB                  │
│ │   │   └── functions/      ← Exported from DB           │
│ │   │       └── health.ts                                │
│ │   └── blog-app/                                        │
│ │       └── db.sqlite                                    │
│ │                                                        │
│ draft/                                                   │
│ └── apps/                                                │
│     └── todo-app/                                        │
│         ├── db.sqlite       ← Draft DB                   │
│         └── functions/      ← Exported from DB           │
│             └── health.ts                                │
│                                                          │
└──────────────────────────────────────────────────────────┘
   Platform DB (source of truth)    Runtime state
         │                               ▲
         ▼                               │
   ┌───────────────────────────────────┐ │
   │ cozybase daemon                   │ │
   │  Workspace → AppContext (per-app) │ │
   │  DraftReconciler / Verifier /     │─┘
   │  Publisher → SQLite               │
   │  Management API + Admin UI        │
   └───────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
bun install

# Start the daemon (workspace auto-initializes at ~/.cozybase)
bun run packages/server/src/index.ts
```

On first run, Cozybase auto-creates the workspace with an example `welcome` app (a TODO list with UI):

```
Initializing new workspace...
  Workspace created at /Users/you/.cozybase

  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0             ║
  ║  Local BaaS Platform for AI Agents    ║
  ╚═══════════════════════════════════════╝

  Server:    http://0.0.0.0:3000
  Workspace: /Users/you/.cozybase
```

### Create an App

All app management is done via the Management API:

```bash
# Create a new app
curl -X POST http://localhost:3000/api/v1/apps \
  -H 'Content-Type: application/json' \
  -d '{"name": "todo-app", "description": "A simple todo application"}'
# Returns: app info with template files + API key

# Add a migration via the file API
curl -X PUT http://localhost:3000/api/v1/apps/todo-app/files/migrations/001_init.sql \
  -H 'Content-Type: application/json' \
  -d '{"content": "CREATE TABLE todos (\n  id INTEGER PRIMARY KEY AUTOINCREMENT,\n  title TEXT NOT NULL,\n  completed INTEGER DEFAULT 0,\n  created_at TEXT DEFAULT (datetime('\''now'\''))\n);\nCREATE INDEX idx_todos_completed ON todos(completed);"}'

# (Optional) Add seed data for draft testing
curl -X PUT http://localhost:3000/api/v1/apps/todo-app/files/seeds/todos.sql \
  -H 'Content-Type: application/json' \
  -d '{"content": "INSERT INTO todos (title, completed) VALUES ('\''Buy milk'\'', 0);\nINSERT INTO todos (title, completed) VALUES ('\''Read docs'\'', 1);"}'

# Reconcile draft — builds a fresh Draft database
curl -X POST http://localhost:3000/draft/apps/todo-app/reconcile
# {"data":{"success":true,"migrations":["001_init.sql"],"seeds":["todos.sql"]}}

# Query the Draft database
curl http://localhost:3000/draft/apps/todo-app/db/todos
# {"data":[{"id":1,"title":"Buy milk",...},{"id":2,"title":"Read docs",...}]}
```

For batch file changes, use the **Checkout-Edit-Push** workflow: fetch the full app snapshot with `GET /api/v1/apps/todo-app`, edit files locally, then push all changes at once with `PUT /api/v1/apps/todo-app` (includes optimistic locking via `base_version`).

## Development Workflow

Cozybase uses a **Stable/Draft dual-version model**:

```
┌─────────────┐     ┌──────────┐     ┌────────┐     ┌─────────┐
│ Write       │────▶│ Reconcile│────▶│ Verify │────▶│ Publish │
│ Migrations  │     │ (Draft)  │     │        │     │         │
└─────────────┘     └──────────┘     └────────┘     └─────────┘
  via Management     Destroy+rebuild   Test against    Apply to
  API                draft DB          stable copy     stable DB
```

1. **Write migrations**: Use the Management API to create/update migration files (stored in Platform DB)
2. **Draft Reconcile**: `POST /draft/apps/:appName/reconcile` — destroys and rebuilds draft DB from all migrations + seeds
3. **Verify** (for existing apps): `POST /draft/apps/:appName/verify` — tests new migrations against a copy of the stable DB
4. **Publish**: `POST /draft/apps/:appName/publish` — applies migrations to stable DB, marks migrations as immutable, cleans draft

### App States

| State | Meaning |
|-------|---------|
| `draft_only` | New app, not yet published |
| `stable` | Published, no pending changes |
| `stable_draft` | Published, with unpublished file changes |
| `deleted` | Soft-deleted via Management API |

### Iterating on Migrations

During development, you can freely edit migrations via the API and re-reconcile — Draft Reconcile always destroys and rebuilds:

```bash
# Edit a migration, then re-reconcile
curl -X POST http://localhost:3000/draft/apps/todo-app/reconcile

# Query draft to verify changes
curl http://localhost:3000/draft/apps/todo-app/db/todos
```

Once published, migrations become **immutable** (the API rejects modifications to published migration files). To make further schema changes, add a new migration:

```bash
# Add a new migration file via the API
curl -X PUT http://localhost:3000/api/v1/apps/todo-app/files/migrations/002_add_priority.sql \
  -H 'Content-Type: application/json' \
  -d '{"content": "ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;"}'

# Reconcile draft, verify, then publish
curl -X POST http://localhost:3000/draft/apps/todo-app/reconcile
curl -X POST http://localhost:3000/draft/apps/todo-app/verify
curl -X POST http://localhost:3000/draft/apps/todo-app/publish
```

## CRUD Operations

All database operations go through either `/stable/` or `/draft/` routes:

```bash
# Create a record (against Stable DB)
curl -X POST http://localhost:3000/stable/apps/todo-app/db/todos \
  -H 'Content-Type: application/json' \
  -d '{"title": "Buy milk"}'

# List records
curl http://localhost:3000/stable/apps/todo-app/db/todos

# Filter records
curl 'http://localhost:3000/stable/apps/todo-app/db/todos?where=completed.eq.0'

# Update a record
curl -X PATCH http://localhost:3000/stable/apps/todo-app/db/todos/1 \
  -H 'Content-Type: application/json' \
  -d '{"completed": 1}'

# Delete a record
curl -X DELETE http://localhost:3000/stable/apps/todo-app/db/todos/1

# Raw SQL
curl -X POST http://localhost:3000/stable/apps/todo-app/db/sql \
  -H 'Content-Type: application/json' \
  -d '{"sql": "SELECT * FROM todos WHERE completed = 0"}'
```

Use `/draft/` prefix instead to operate on the Draft database during development.

## Functions

Cozybase supports TypeScript functions as HTTP endpoints. Functions are stored as `.ts` files in the Platform DB (under the `functions/` path prefix) and use **Next.js Route Handler-style** named exports:

### Defining a Function

```typescript
// functions/health.ts
export async function GET(ctx) {
  return { status: "ok", app: ctx.app.name, mode: ctx.mode };
}
```

Each named export handles one HTTP method. Use `export default` as a catch-all:

```typescript
// functions/items.ts
export async function GET(ctx) {
  const items = ctx.db.query("SELECT * FROM todos");
  return items;
}

export async function POST(ctx) {
  const body = await ctx.req.json();
  ctx.db.run("INSERT INTO todos (title) VALUES (?)", [body.title]);
  return { created: true };
}

export default async function (ctx) {
  return new Response("Method not implemented", { status: 501 });
}
```

### FunctionContext

Every handler receives a `ctx` object with:

| Property | Type | Description |
|----------|------|-------------|
| `ctx.req` | `Request` | Standard Web Request object |
| `ctx.db` | `DatabaseClient` | SQLite client for the current mode (`query`, `run`, `exec`) |
| `ctx.env` | `Record<string, string>` | Environment variables |
| `ctx.app` | `{ name: string }` | App metadata |
| `ctx.mode` | `'stable' \| 'draft'` | Current execution mode |
| `ctx.log` | `Logger` | Structured logger (`info`, `warn`, `error`, `debug`) |
| `ctx.fetch` | `fetch` | HTTP client |

### Return Values

| Return type | HTTP response |
|-------------|---------------|
| `Response` object | Passed through directly |
| Object / Array | `200` with `application/json` |
| `null` / `undefined` | `204 No Content` |
| Thrown error | `500` with error details (stack trace in Draft mode) |

### Calling Functions

```bash
# Draft mode (hot-reloads on every request)
curl http://localhost:3000/draft/apps/todo-app/functions/health
# {"status":"ok","app":"todo-app","mode":"draft"}

# Stable mode (cached modules, reloaded on publish)
curl http://localhost:3000/stable/apps/todo-app/functions/health
# {"status":"ok","app":"todo-app","mode":"stable"}

# POST to a function
curl -X POST http://localhost:3000/draft/apps/todo-app/functions/items \
  -H 'Content-Type: application/json' \
  -d '{"title": "New item"}'
```

### Function Conventions

- File paths map to route names: `functions/health.ts` -> `/functions/health`
- Files prefixed with `_` (e.g. `functions/_utils.ts`) are not exposed as endpoints
- Functions are stored in Platform DB and exported to the filesystem during Reconcile/Publish for Bun `import()`
- Draft mode: functions are re-imported on every request (hot-reload)
- Stable mode: modules are cached; cache is refreshed on Publish
- During Draft Reconcile, functions are validated (valid exports checked) with warnings in the result

### Query Parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `select` | `select=id,title` | Column projection |
| `where` | `where=age.gt.18` | Filter with operator |
| `order` | `order=created_at.desc` | Sort order |
| `limit` | `limit=20` | Max rows (default 1000) |
| `offset` | `offset=10` | Skip rows for pagination |

**Where operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`

## Admin UI

Cozybase includes a built-in Admin UI that renders app interfaces from declarative JSON definitions. Apps define their UI in `ui/pages.json`, and the Admin SPA renders them automatically.

Access the Admin at `http://localhost:3000/` after starting the server.

### JSON UI Schema

Each app's UI is defined in `ui/pages.json`:

```json
{
  "pages": [
    {
      "id": "todo-list",
      "title": "TODO List",
      "body": [
        { "type": "heading", "text": "TODO List", "level": 2 },
        {
          "type": "table",
          "id": "todo-table",
          "api": { "url": "/db/todo" },
          "columns": [
            { "name": "title", "label": "Title" },
            {
              "name": "completed", "label": "Status",
              "render": {
                "type": "tag",
                "text": "${row.completed === 1 ? 'Done' : 'Pending'}",
                "color": "${row.completed === 1 ? 'success' : 'default'}"
              }
            }
          ]
        }
      ]
    }
  ],
  "components": {}
}
```

- **`pages`** — Array of page objects. Each page has `id` (also used as the route path), `title`, and `body` (component tree).
- **`components`** — Optional custom component declarations with props and body templates.

### Built-in Components

| Category | Components |
|----------|-----------|
| Layout | `page`, `row`, `col`, `card`, `tabs`, `divider` |
| Data Display | `table`, `list`, `text`, `heading`, `tag`, `stat` |
| Data Input | `form`, `input`, `textarea`, `number`, `select`, `switch`, `checkbox`, `radio`, `date-picker` |
| Action & Feedback | `button`, `link`, `dialog`, `alert`, `empty` |

### Expressions

Components support `${...}` expressions for dynamic values:

- `${row.completed}` — Access current row data in table columns
- `${status-tabs.value}` — Cross-component state reference
- `${row.completed === 1 ? 'Done' : 'Pending'}` — Ternary expressions
- `${form.title}` — Form field values
- `${props.label}` — Custom component props

### Actions

Interactive behaviors are declared via actions:

| Action | Description |
|--------|-------------|
| `api` | HTTP request with `method`, `url`, `body`, `onSuccess`/`onError` callbacks |
| `reload` | Trigger reload on a target component by id |
| `dialog` | Open a modal dialog with a component body |
| `link` | Navigate to URL with optional params |
| `close` | Close the current dialog |
| `confirm` | Show confirmation dialog before proceeding |

API URLs in actions use app-relative paths (e.g. `/db/todo`, `/functions/hello`) — the renderer auto-completes them.

### Admin Routes

| Path | Description |
|------|-------------|
| `/` | Redirect to app list |
| `/apps` | List all apps |
| `/apps/:appName` | Redirect to first page of an app |
| `/apps/:appName/:pageId` | Render a specific page |

### UI-only Changes

When only modifying `ui/pages.json`, the Reconcile / Verify / Publish workflow is not needed — UI files don't involve database schema changes. Just update the file directly:

```bash
curl -X PUT http://localhost:3000/api/v1/apps/todo-app/files/ui/pages.json \
  -H 'Content-Type: application/json' \
  -d '{"content": "{\"pages\": [...]}"}'
```

## CLI Options

```
bun run packages/server/src/index.ts [options]

Options:
  --workspace <path>   Workspace directory (default: ~/.cozybase)
  --port <number>      Server port (default: 3000)
```

Environment variables `COZYBASE_WORKSPACE`, `COZYBASE_PORT` are also supported.

## API Reference

### Platform

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/api/v1/apps` | List all apps with states |
| GET | `/api/v1/apps/:appName` | Single app with files |
| POST | `/api/v1/apps` | Create a new app |
| PUT | `/api/v1/apps/:appName` | Update app (optimistic lock with `base_version`) |
| PUT | `/api/v1/apps/:appName/files/*` | Update a single file |
| DELETE | `/api/v1/apps/:appName` | Delete an app |

### Stable Database

All paths prefixed with `/stable/apps/:appName/db`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/schema` | Introspect all tables |
| POST | `/sql` | Execute raw SQL |
| GET | `/:table` | List records |
| GET | `/:table/:id` | Get single record |
| POST | `/:table` | Create record |
| PATCH | `/:table/:id` | Update record |
| DELETE | `/:table/:id` | Delete record |

### Draft Database

Same endpoints as Stable, prefixed with `/draft/apps/:appName/db`

### Draft Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/draft/apps/:appName/reconcile` | Rebuild draft DB from all migrations + seeds |
| POST | `/draft/apps/:appName/verify` | Verify new migrations against stable DB copy |
| POST | `/draft/apps/:appName/publish` | Apply to stable, mark immutable, clean draft |

### Functions

| Method | Path | Description |
|--------|------|-------------|
| * | `/stable/apps/:appName/functions/:name` | Execute stable function |
| * | `/draft/apps/:appName/functions/:name` | Execute draft function (hot-reload) |

## Workspace Structure

```
~/.cozybase/                            # Workspace root
├── workspace.yaml                      # Config: name + schema version
├── data/                               # Persistent state
│   ├── platform.sqlite                 # Source of Truth (apps, app_files, api_keys)
│   └── apps/
│       ├── todo-app/
│       │   ├── db.sqlite               # Stable database
│       │   ├── db.sqlite.bak           # Auto-backup before publish
│       │   └── functions/              # Function files (exported from DB)
│       │       └── health.ts
│       └── blog-app/
│           ├── db.sqlite
│           └── functions/
│               └── posts.ts
└── draft/                              # Draft runtime state
    └── apps/
        └── todo-app/
            ├── db.sqlite               # Draft database (destroy+rebuild)
            └── functions/              # Function files (exported from DB)
                └── health.ts
```

App definitions (migrations, functions, seeds, UI, config) are stored in `platform.sqlite`'s `app_files` table — **not** on the filesystem. The `functions/` directories under `data/` and `draft/` are runtime exports: during Reconcile/Publish, function source code is written from the DB to disk so Bun can `import()` them.

### Platform DB Schema

The `platform.sqlite` database contains:

| Table | Purpose |
|-------|---------|
| `apps` | App registry (name, description, status, `current_version`, `published_version`) |
| `app_files` | All app files: migrations, functions, seeds, UI, config. Keyed by `(app_name, path)`. Published migrations marked `immutable = 1` |
| `api_keys` | Per-app API key hashes |

### Migration File Format

Migration files are stored in the `app_files` table under paths like `migrations/{NNN}_{description}.sql`:

```sql
-- 001_init.sql
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 002_add_priority.sql
ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;
```

### Seed File Format

Seeds are loaded during Draft Reconcile only (not during Publish). Stored under `seeds/` paths, supports `.sql` and `.json`:

```sql
-- seeds/todos.sql
INSERT INTO todos (title, completed) VALUES ('Example todo', 0);
```

```json
// seeds/todos.json
{"table": "todos", "rows": [{"title": "Example", "completed": 0}]}
```

## Architecture

### Core Concepts

- **Workspace**: Self-contained directory (`~/.cozybase`) with `data/` (Platform DB + stable runtime) and `draft/` (draft runtime). Auto-initializes on first startup with template apps loaded into the Platform DB.
- **Platform DB**: Central `platform.sqlite` stores all app definitions (`apps` + `app_files` tables). Acts as the single source of truth — Management API is the only entry point for modifications.
- **AppContext**: Per-app resource container with separate Stable and Draft database connections. Created lazily on first request.
- **DraftReconciler**: Reads migrations, seeds, and functions from Platform DB, destroys and rebuilds the draft database. Exports function files to disk for Bun `import()`.
- **Verifier**: Checks that published migrations are marked immutable, then tests new migrations against a copy of the stable database.
- **Publisher**: Backs up the stable database, applies new migrations incrementally, records them in `_migrations` table, marks migration files as `immutable`, exports functions, reloads function cache, and cleans up draft.
- **Management API**: RESTful HTTP API (`/api/v1/apps/*`) for app CRUD and file management. Supports single-file updates and batch Checkout-Edit-Push with optimistic locking (`base_version`).
- **FunctionRuntime**: Abstraction for loading and executing user TypeScript functions. `DirectRuntime` (MVP) runs functions in the main process via `import()`. Draft mode uses cache-busting for hot-reload; Stable mode caches modules.
- **UI Renderer (`@cozybase/ui`)**: JSON-to-React rendering engine. Parses `ui/pages.json` into a component tree using a registry of 26 built-in components. Features an expression engine (`${...}` syntax with scoped contexts), action dispatcher (6 action types), and `PageContext` for cross-component state sharing and event propagation.
- **Admin SPA (`@cozybase/admin`)**: Vite-built React SPA served as static files by the server. Lists apps, renders page UIs via `SchemaRenderer`, handles routing and navigation.
- **App States**: Derived from DB fields — `published_version = 0` → `draft_only`, `current_version = published_version` → `stable`, `current_version > published_version` → `stable_draft`, `status = deleted` → `deleted`.

### Project Structure

```
cozybase/
├── packages/
│   ├── server/                 # Daemon server
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── server.ts             # Hono app factory + static file serving
│   │   │   ├── config.ts             # Configuration
│   │   │   ├── core/
│   │   │   │   ├── workspace.ts      # Workspace + Platform DB + app state
│   │   │   │   ├── app-context.ts    # Per-app resource container
│   │   │   │   ├── migration-runner.ts # Scan, execute, track migrations
│   │   │   │   ├── seed-loader.ts    # Load .sql/.json seed files
│   │   │   │   ├── draft-reconciler.ts # Destroy+rebuild draft DB
│   │   │   │   ├── verifier.ts       # Immutability check + test new migrations
│   │   │   │   ├── publisher.ts      # Publish draft → stable + mark immutable
│   │   │   │   ├── event-bus.ts      # Pub/sub for DB changes
│   │   │   │   ├── auth.ts           # JWT + API key auth
│   │   │   │   └── errors.ts         # Error hierarchy
│   │   │   ├── middleware/
│   │   │   │   ├── app-resolver.ts   # Resolves AppContext + mode per request
│   │   │   │   ├── auth.ts
│   │   │   │   └── logger.ts
│   │   │   └── modules/
│   │   │       ├── apps/
│   │   │       │   ├── routes.ts     # Management API routes (CRUD + files)
│   │   │       │   ├── manager.ts    # App CRUD + file management operations
│   │   │       │   └── mcp-types.ts  # MCP tool type definitions
│   │   │       ├── db/
│   │   │       │   ├── routes.ts         # Auto CRUD
│   │   │       │   ├── query-builder.ts  # URL → SQL
│   │   │       │   ├── schema.ts         # Schema introspection
│   │   │       │   └── sql.ts            # Raw SQL execution
│   │   │       └── functions/
│   │   │           ├── types.ts          # FunctionRuntime, FunctionContext interfaces
│   │   │           ├── direct-runtime.ts # Module loading + execution
│   │   │           ├── context.ts        # FunctionContext builder
│   │   │           ├── database-client.ts # SQLite wrapper for functions
│   │   │           ├── logger.ts         # Structured function logger
│   │   │           └── routes.ts         # Function HTTP routes
│   │   └── tests/                  # Automated tests (Bun test runner)
│   │       ├── helpers/
│   │       │   └── test-workspace.ts
│   │       ├── core/               # Unit + integration tests
│   │       ├── modules/            # Module integration tests (functions, etc.)
│   │       └── scenarios/          # End-to-end tests
│   ├── ui/                    # JSON-to-React UI renderer (@cozybase/ui)
│   │   └── src/
│   │       ├── index.ts              # Public exports
│   │       ├── renderer.tsx          # SchemaRenderer entry + NodeRenderer
│   │       ├── schema/
│   │       │   └── types.ts          # PagesJson, ComponentSchema, ActionSchema types
│   │       ├── engine/
│   │       │   ├── registry.ts       # Component registry (builtin + custom)
│   │       │   ├── context.tsx       # PageContext (state, reload, dialog, customComponents)
│   │       │   ├── expression.ts     # ${...} expression resolver (whitelist-based)
│   │       │   └── action.ts         # Action dispatcher (api, reload, dialog, etc.)
│   │       └── components/
│   │           ├── layout.tsx        # page, row, col, card, tabs, divider
│   │           ├── display.tsx       # table, list, text, heading, tag, stat
│   │           ├── input.tsx         # form, input, textarea, number, select, switch, ...
│   │           └── action.tsx        # button, link, dialog, alert, empty
│   ├── admin/                 # Admin SPA (Vite + React)
│   │   └── src/
│   │       ├── main.tsx              # Vite entry point
│   │       ├── app.tsx               # Router setup
│   │       └── pages/
│   │           ├── app-list.tsx      # App listing page
│   │           ├── app-layout.tsx    # App sidebar + navigation
│   │           └── app-page-view.tsx # SchemaRenderer integration
│   └── sdk/                   # TypeScript SDK (planned)
└── openspec/                   # Design specs and change tracking
```

## Testing

```bash
# Run all server tests
bun test packages/server/

# Run by category
cd packages/server
bun run test:unit          # MigrationRunner, SeedLoader, AppContext
bun run test:integration   # Workspace, DraftReconciler, Verifier, Publisher, Functions
bun run test:e2e           # Full workflow scenarios

# Run UI renderer tests (expression engine, action dispatcher, component registry)
bun test packages/ui/src/

# Build admin SPA
cd packages/admin && bun run build
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP**: [Hono](https://hono.dev)
- **Database**: SQLite via `bun:sqlite` (WAL mode, per-app isolation)
- **UI**: [React](https://react.dev) 19 + [Vite](https://vite.dev)
- **Validation**: [Zod](https://zod.dev)
- **Auth**: [jose](https://github.com/panva/jose) (JWT)
- **YAML**: [yaml](https://eemeli.org/yaml/)

## Roadmap

- [x] Self-contained workspace with auto-initialization
- [x] Migration-based schema management (Stable/Draft model)
- [x] Per-app isolation via AppContext
- [x] Draft Reconcile / Verify / Publish workflow
- [x] Database-first app storage (Platform DB as source of truth)
- [x] Management API (Checkout-Edit-Push with optimistic locking)
- [x] Auto CRUD REST API
- [x] Raw SQL execution
- [x] Query builder (filter, sort, paginate)
- [x] Seed data loading (SQL + JSON)
- [x] Stable database backup and rollback
- [x] Automated test suite
- [x] Functions module (TypeScript HTTP handlers with hot-reload)
- [x] JSON-to-UI renderer (26 built-in components, expression engine, action system)
- [x] Admin UI (React SPA with app management and page rendering)
- [ ] MCP Server (AI Agent integration via Model Context Protocol)
- [ ] Storage module (file uploads + buckets)
- [ ] Worker runtime (per-app Bun Worker isolation)
- [ ] Cron scheduler
- [ ] Realtime (WebSocket + change events)
- [ ] Auth module
- [ ] TypeScript SDK
- [ ] CLI tool

## License

MIT
