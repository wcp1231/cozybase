# Cozybase

Local BaaS (Backend as a Service) platform for AI Agents. Built with TypeScript, Bun, and SQLite.

Cozybase runs as a daemon process, manages a self-contained workspace, and supports a migration-based development workflow with Stable/Draft dual-version model. AI Agents write SQL migrations, iterate in Draft mode, then publish to Stable.

```
Workspace (~/.cozybase)
┌──────────────────────────────────────────────────────────┐
│ workspace.yaml            ← config (name+version)        │
│ .gitignore                                               │
│                                                          │
│ apps/ (git-tracked)        data/ (git-ignored)           │
│ ├── todo-app/              ├── platform.sqlite           │
│ │   ├── app.yaml           └── apps/                     │
│ │   ├── migrations/            ├── todo-app/             │
│ │   │   ├── 001_init.sql       │   └── db.sqlite  ← Stable DB
│ │   │   └── 002_add_tags.sql   └── blog-app/            │
│ │   ├── seeds/                     └── db.sqlite         │
│ │   │   └── todos.sql                                    │
│ │   └── functions/         draft/ (git-ignored)          │
│ │       └── health.ts      └── apps/                     │
│ └── blog-app/                  └── todo-app/             │
│     ├── app.yaml                   └── db.sqlite  ← Draft DB
│     └── migrations/                                      │
│         └── 001_init.sql                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
   Declarations (source of truth)   Runtime state
         │                               ▲
         ▼                               │
   ┌───────────────────────────────────┐ │
   │ cozybase daemon                   │ │
   │  Workspace → AppContext (per-app) │ │
   │  DraftReconciler / Verifier /     │─┘
   │  Publisher → SQLite               │
   │  HTTP Server + Event Bus          │
   └───────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
bun install

# Start the daemon (workspace auto-initializes at ~/.cozybase)
bun run packages/server/src/index.ts
```

On first run, Cozybase auto-creates the workspace with an example `hello` app:

```
Initializing new workspace...
  Workspace created at /Users/you/.cozybase

  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0            ║
  ║  Local BaaS Platform for AI Agents   ║
  ╚═══════════════════════════════════════╝

  Server:    http://0.0.0.0:3000
  Workspace: /Users/you/.cozybase
```

### Create an App

```bash
# Create app directory with a migration
mkdir -p ~/.cozybase/apps/todo-app/migrations

cat > ~/.cozybase/apps/todo-app/app.yaml << 'EOF'
description: "A simple todo application"
EOF

cat > ~/.cozybase/apps/todo-app/migrations/001_init.sql << 'EOF'
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX idx_todos_completed ON todos(completed);
EOF

# (Optional) Add seed data for draft testing
mkdir -p ~/.cozybase/apps/todo-app/seeds
cat > ~/.cozybase/apps/todo-app/seeds/todos.sql << 'EOF'
INSERT INTO todos (title, completed) VALUES ('Buy milk', 0);
INSERT INTO todos (title, completed) VALUES ('Read docs', 1);
EOF

# Reconcile draft — builds a fresh Draft database
curl -X POST http://localhost:3000/draft/apps/todo-app/reconcile
# {"data":{"success":true,"migrations":["001_init.sql"],"seeds":["todos.sql"]}}

# Query the Draft database
curl http://localhost:3000/draft/apps/todo-app/db/todos
# {"data":[{"id":1,"title":"Buy milk",...},{"id":2,"title":"Read docs",...}]}
```

## Development Workflow

Cozybase uses a **Stable/Draft dual-version model**:

```
┌─────────────┐     ┌──────────┐     ┌────────┐     ┌─────────┐
│ Write       │────▶│ Reconcile│────▶│ Verify │────▶│ Publish │
│ Migrations  │     │ (Draft)  │     │        │     │         │
└─────────────┘     └──────────┘     └────────┘     └─────────┘
                    Destroy+rebuild   Test against    Apply to
                    draft DB          stable copy     stable DB
                                                     + git commit
```

1. **Write migrations**: Create SQL files in `apps/{name}/migrations/` following `{NNN}_{description}.sql` naming
2. **Draft Reconcile**: `POST /draft/apps/:appName/reconcile` — destroys and rebuilds draft DB from all migrations + seeds
3. **Verify** (for existing apps): `POST /draft/apps/:appName/verify` — tests new migrations against a copy of the stable DB
4. **Publish**: `POST /draft/apps/:appName/publish` — applies migrations to stable DB, git commits, cleans draft

### App States

| State | Meaning |
|-------|---------|
| `draft_only` | New app, not yet published |
| `stable` | Published, no pending changes |
| `stable_draft` | Published, with uncommitted migration changes |
| `deleted` | Soft-deleted via `status: deleted` in `app.yaml` |

### Iterating on Migrations

During development, you can freely edit migrations and re-reconcile — Draft Reconcile always destroys and rebuilds:

```bash
# Edit a migration, then re-reconcile
curl -X POST http://localhost:3000/draft/apps/todo-app/reconcile

# Query draft to verify changes
curl http://localhost:3000/draft/apps/todo-app/db/todos
```

Once published, committed migrations become **immutable**. To make further schema changes, add a new migration:

```bash
cat > ~/.cozybase/apps/todo-app/migrations/002_add_priority.sql << 'EOF'
ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0;
EOF

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

Cozybase supports TypeScript functions as HTTP endpoints. Functions are defined as `.ts` files in `apps/{name}/functions/` and use **Next.js Route Handler-style** named exports:

### Defining a Function

```typescript
// apps/todo-app/functions/health.ts
export async function GET(ctx) {
  return { status: "ok", app: ctx.app.name, mode: ctx.mode };
}
```

Each named export handles one HTTP method. Use `export default` as a catch-all:

```typescript
// apps/todo-app/functions/items.ts
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

- File names map to route names: `health.ts` -> `/functions/health`
- Files prefixed with `_` (e.g. `_utils.ts`) are not exposed as endpoints
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
| GET | `/api/v1/apps/:appName` | Single app status |

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
| POST | `/draft/apps/:appName/publish` | Apply to stable, git commit, clean draft |

### Functions

| Method | Path | Description |
|--------|------|-------------|
| * | `/stable/apps/:appName/functions/:name` | Execute stable function |
| * | `/draft/apps/:appName/functions/:name` | Execute draft function (hot-reload) |

## Workspace Structure

```
~/.cozybase/                            # Workspace root
├── workspace.yaml                      # Config: name + schema version
├── .gitignore                          # Ignores data/, draft/, *.sqlite*
├── apps/                               # Declarations (git-tracked)
│   ├── todo-app/
│   │   ├── app.yaml                    # Required: marks this as an app
│   │   ├── migrations/                 # SQL migrations ({NNN}_{name}.sql)
│   │   │   ├── 001_init.sql
│   │   │   └── 002_add_priority.sql
│   │   ├── seeds/                      # Test data (.sql or .json)
│   │   │   └── todos.sql
│   │   └── functions/                  # TypeScript HTTP handlers
│   │       └── health.ts
│   └── blog-app/
│       ├── app.yaml
│       └── migrations/
│           └── 001_init.sql
├── data/                               # Stable runtime state (git-ignored)
│   ├── platform.sqlite                 # Platform DB (apps, api_keys)
│   └── apps/
│       ├── todo-app/
│       │   ├── db.sqlite               # Stable database
│       │   └── db.sqlite.bak           # Auto-backup before publish
│       └── blog-app/
│           └── db.sqlite
└── draft/                              # Draft runtime state (git-ignored)
    └── apps/
        └── todo-app/
            └── db.sqlite               # Draft database (destroy+rebuild)
```

### Migration File Format

SQL files in `migrations/`, named `{NNN}_{description}.sql`:

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

Seeds are loaded during Draft Reconcile only (not during Publish). Supports `.sql` and `.json`:

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

- **Workspace**: Self-contained directory (`~/.cozybase`) with `apps/` (git-tracked declarations), `data/` (stable runtime), and `draft/` (draft runtime). Auto-initializes on first startup.
- **AppContext**: Per-app resource container with separate Stable and Draft database connections. Created lazily on first request.
- **DraftReconciler**: Destroys and rebuilds the draft database from all migrations + seeds. Used during iterative development.
- **Verifier**: Checks that committed migrations haven't been modified, then tests new migrations against a copy of the stable database.
- **Publisher**: Backs up the stable database, applies new migrations incrementally, records them in `_migrations` table, reloads function cache, git commits, and cleans up draft.
- **FunctionRuntime**: Abstraction for loading and executing user TypeScript functions. `DirectRuntime` (MVP) runs functions in the main process via `import()`. Draft mode uses cache-busting for hot-reload; Stable mode caches modules.
- **App States**: Dynamically derived from git status and filesystem — `draft_only`, `stable`, `stable_draft`, `deleted`.
- **Git Integration**: After successful Publish, `apps/` changes are auto-committed to the workspace git repo.

### Project Structure

```
cozybase/
├── packages/
│   ├── server/                 # Daemon server
│   │   ├── src/
│   │   │   ├── index.ts              # Entry point
│   │   │   ├── server.ts             # Hono app factory
│   │   │   ├── config.ts             # Configuration
│   │   │   ├── core/
│   │   │   │   ├── workspace.ts      # Workspace + app discovery + git
│   │   │   │   ├── app-context.ts    # Per-app resource container
│   │   │   │   ├── migration-runner.ts # Scan, execute, track migrations
│   │   │   │   ├── seed-loader.ts    # Load .sql/.json seed files
│   │   │   │   ├── draft-reconciler.ts # Destroy+rebuild draft DB
│   │   │   │   ├── verifier.ts       # Immutability check + test migrations
│   │   │   │   ├── publisher.ts      # Publish draft → stable
│   │   │   │   ├── event-bus.ts      # Pub/sub for DB changes
│   │   │   │   ├── auth.ts           # JWT + API key auth
│   │   │   │   └── errors.ts         # Error hierarchy
│   │   │   ├── middleware/
│   │   │   │   ├── app-resolver.ts   # Resolves AppContext + mode per request
│   │   │   │   ├── auth.ts
│   │   │   │   └── logger.ts
│   │   │   └── modules/
│   │   │       ├── apps/
│   │   │       │   ├── routes.ts     # Platform status API
│   │   │       │   └── manager.ts    # App CRUD operations
│   │   │       └── db/
│   │   │           ├── routes.ts         # Auto CRUD
│   │   │           ├── query-builder.ts  # URL → SQL
│   │   │           ├── schema.ts         # Schema introspection
│   │   │           └── sql.ts            # Raw SQL execution
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
│   ├── sdk/                    # TypeScript SDK (planned)
│   └── admin/                  # React Admin UI (planned)
└── openspec/                   # Design specs and change tracking
```

## Testing

```bash
cd packages/server

# Run all tests
bun test tests/

# Run by category
bun run test:unit          # MigrationRunner, SeedLoader, AppContext
bun run test:integration   # Workspace, DraftReconciler, Verifier, Publisher, Functions
bun run test:e2e           # Full workflow scenarios
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP**: [Hono](https://hono.dev)
- **Database**: SQLite via `bun:sqlite` (WAL mode, per-app isolation)
- **Validation**: [Zod](https://zod.dev)
- **Auth**: [jose](https://github.com/panva/jose) (JWT)
- **YAML**: [yaml](https://eemeli.org/yaml/)

## Roadmap

- [x] Self-contained workspace with auto-initialization
- [x] Migration-based schema management (Stable/Draft model)
- [x] Per-app isolation via AppContext
- [x] Draft Reconcile / Verify / Publish workflow
- [x] Git auto-commit on publish
- [x] Auto CRUD REST API
- [x] Raw SQL execution
- [x] Query builder (filter, sort, paginate)
- [x] Seed data loading (SQL + JSON)
- [x] Stable database backup and rollback
- [x] Automated test suite
- [x] Functions module (TypeScript HTTP handlers with hot-reload)
- [ ] Storage module (file uploads + buckets)
- [ ] Worker runtime (per-app Bun Worker isolation)
- [ ] Cron scheduler
- [ ] Realtime (WebSocket + change events)
- [ ] Auth module
- [ ] Admin UI (React)
- [ ] TypeScript SDK
- [ ] CLI tool

## License

MIT
