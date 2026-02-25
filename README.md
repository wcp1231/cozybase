# Cozybase

Local BaaS (Backend as a Service) platform for AI Agents. Built with TypeScript, Bun, and SQLite.

Cozybase runs as a daemon process, manages a self-contained workspace, and auto-discovers apps defined as YAML specs. Schema changes are reconciled on demand — no migrations to run manually.

```
Workspace (~/.cozybase)
┌─────────────────────────────────────────────────┐
│ workspace.yaml          ← config (name+version) │
│ .gitignore                                      │
│                                                 │
│ apps/ (git-tracked)     data/ (git-ignored)     │
│ ├── todo-app/           ├── platform.sqlite     │
│ │   ├── app.yaml        └── apps/               │
│ │   ├── tables/             ├── todo-app/       │
│ │   │   └── todos.yaml      │   └── db.sqlite   │
│ │   └── functions/          └── blog-app/       │
│ │       └── hello.ts            └── db.sqlite   │
│ └── blog-app/                                   │
│     ├── app.yaml                                │
│     └── tables/                                 │
│         └── posts.yaml                          │
└─────────────────────────────────────────────────┘
   Declarations (source of truth)  Runtime state
         │                              ▲
         ▼                              │
   ┌──────────────────────────────────┐ │
   │ cozybase daemon                  │ │
   │  Workspace → Reconciler → SQLite │─┘
   │  AppContext (per-app isolation)   │
   │  HTTP Server + Event Bus         │
   └──────────────────────────────────┘
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
Reconciling workspace...
  ✓ [hello] create_app: hello

  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0            ║
  ║  Local BaaS Platform for AI Agents   ║
  ╚═══════════════════════════════════════╝

  Server:    http://0.0.0.0:3000
  Workspace: /Users/you/.cozybase
```

### Create an App

```bash
# Create an app with a table
mkdir -p ~/.cozybase/apps/todo-app/tables

cat > ~/.cozybase/apps/todo-app/app.yaml << 'EOF'
description: "A simple todo application"
EOF

cat > ~/.cozybase/apps/todo-app/tables/todos.yaml << 'EOF'
columns:
  - name: id
    type: text
    primary_key: true
  - name: title
    type: text
    required: true
  - name: completed
    type: integer
    default: "0"
  - name: created_at
    type: text
    default: "(datetime('now'))"

indexes:
  - columns: [completed]
EOF

# Trigger reconcile to create the table
curl -X POST http://localhost:3000/api/v1/reconcile
# {"data":{"changes":[{"app":"todo-app","type":"create_table","resource":"todos","detail":"4 columns"}]}}
```

## Usage

### CRUD Operations

```bash
# Create a record (id auto-generated)
curl -X POST http://localhost:3000/api/v1/app/todo-app/db/todos \
  -H 'Content-Type: application/json' \
  -d '{"title": "Buy milk"}'

# List records
curl http://localhost:3000/api/v1/app/todo-app/db/todos

# Filter records
curl 'http://localhost:3000/api/v1/app/todo-app/db/todos?where=completed.eq.0'

# Update a record
curl -X PATCH http://localhost:3000/api/v1/app/todo-app/db/todos/RECORD_ID \
  -H 'Content-Type: application/json' \
  -d '{"completed": 1}'

# Delete a record
curl -X DELETE http://localhost:3000/api/v1/app/todo-app/db/todos/RECORD_ID

# Raw SQL
curl -X POST http://localhost:3000/api/v1/app/todo-app/db/sql \
  -H 'Content-Type: application/json' \
  -d '{"sql": "SELECT * FROM todos WHERE completed = 0"}'
```

### Query Parameters

| Parameter | Example | Description |
|-----------|---------|-------------|
| `select` | `select=id,title` | Column projection |
| `where` | `where=age.gt.18` | Filter with operator |
| `order` | `order=created_at.desc` | Sort order |
| `limit` | `limit=20` | Max rows (default 1000) |
| `offset` | `offset=10` | Skip rows for pagination |

**Where operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `is`, `in`

### Schema Changes

Edit YAML files then trigger reconcile — Cozybase diffs and applies changes:

```bash
# Add a column to todos.yaml, then reconcile
curl -X POST http://localhost:3000/api/v1/reconcile
# ✓ [todo-app] alter_table: todos (+column: priority)
```

After a successful reconcile, changes in `apps/` are auto-committed to git.

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
| GET | `/api/v1/status` | All apps and resources |
| POST | `/api/v1/reconcile` | Trigger manual reconcile |

### App Database

All paths prefixed with `/api/v1/app/:appName/db`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/schema` | Introspect all tables (read-only) |
| POST | `/sql` | Execute raw SQL |
| GET | `/:table` | List records |
| GET | `/:table/:id` | Get single record |
| POST | `/:table` | Create record |
| PATCH | `/:table/:id` | Update record |
| DELETE | `/:table/:id` | Delete record |

## Workspace Structure

```
~/.cozybase/                      # Workspace root
├── workspace.yaml                # Config: name + schema version
├── .gitignore                    # Ignores data/, *.sqlite*
├── apps/                         # Declarations (git-tracked)
│   ├── todo-app/                 # Directory name = app name
│   │   ├── app.yaml              # Required: marks this as an app
│   │   ├── tables/               # Each .yaml = one table
│   │   │   ├── todos.yaml
│   │   │   └── users.yaml
│   │   └── functions/            # Each .ts = one function
│   │       └── hello.ts
│   └── blog-app/
│       ├── app.yaml
│       └── tables/
│           └── posts.yaml
└── data/                         # Runtime state (git-ignored)
    ├── platform.sqlite           # Platform DB (apps, api_keys, etc.)
    └── apps/
        ├── todo-app/
        │   └── db.sqlite         # Per-app database
        └── blog-app/
            └── db.sqlite
```

### Table YAML Format

```yaml
columns:
  - name: id
    type: text           # text | integer | real | blob
    primary_key: true
  - name: email
    type: text
    required: true       # NOT NULL
    unique: true         # UNIQUE constraint
  - name: score
    type: integer
    default: "0"         # Default value
  - name: user_id
    type: text
    references: users(id)  # Foreign key

indexes:
  - columns: [email]
    unique: true
  - columns: [score, created_at]
```

## Architecture

### Core Concepts

- **Workspace**: Self-contained directory (`~/.cozybase`) with `apps/` (git-tracked declarations) and `data/` (git-ignored runtime). Auto-initializes on first startup.
- **AppContext**: Per-app resource container. Each app owns its own SQLite database, paths, and definition. Created lazily on first request or during reconcile.
- **Reconciler**: Diffs YAML declarations against actual SQLite state and applies changes (CREATE TABLE, ALTER TABLE ADD COLUMN, CREATE/DROP INDEX). Triggered explicitly via API.
- **Git Integration**: After successful reconcile, `apps/` changes are auto-committed to the workspace git repo.

### Project Structure

```
cozybase/
├── packages/
│   ├── server/              # Daemon server
│   │   └── src/
│   │       ├── index.ts           # Entry point
│   │       ├── server.ts          # Hono app factory
│   │       ├── config.ts          # Configuration
│   │       ├── core/
│   │       │   ├── workspace.ts   # Workspace class + YAML schemas
│   │       │   ├── app-context.ts # Per-app resource container
│   │       │   ├── reconciler.ts  # Diff + apply engine
│   │       │   ├── event-bus.ts   # Pub/sub for DB changes
│   │       │   ├── auth.ts        # JWT + API key auth
│   │       │   └── errors.ts      # Error hierarchy
│   │       ├── middleware/
│   │       │   ├── app-resolver.ts # Resolves AppContext per request
│   │       │   ├── auth.ts
│   │       │   └── logger.ts
│   │       └── modules/
│   │           ├── apps/
│   │           │   ├── routes.ts    # Platform status API
│   │           │   └── manager.ts   # App CRUD operations
│   │           └── db/
│   │               ├── routes.ts        # Auto CRUD
│   │               ├── query-builder.ts # URL → SQL
│   │               ├── schema.ts        # Schema introspection
│   │               └── sql.ts           # Raw SQL execution
│   ├── sdk/                 # TypeScript SDK (planned)
│   └── admin/               # React Admin UI (planned)
└── openspec/                # Design specs and change tracking
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
- [x] Declarative YAML specs for apps and tables
- [x] Per-app isolation via AppContext
- [x] Reconciler engine (diff + auto-migrate)
- [x] Git auto-commit after reconcile
- [x] Auto CRUD REST API
- [x] Raw SQL execution
- [x] Query builder (filter, sort, paginate)
- [ ] Storage module (file uploads + buckets)
- [ ] Functions module (Bun Worker execution)
- [ ] Cron scheduler
- [ ] Realtime (WebSocket + change events)
- [ ] Auth module
- [ ] Admin UI (React)
- [ ] TypeScript SDK
- [ ] CLI tool

## License

MIT
