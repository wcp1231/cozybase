# Cozybase

Local BaaS (Backend as a Service) platform for AI Agents. Built with TypeScript, Bun, and SQLite.

Cozybase runs as a daemon process, binds to a workspace directory, and auto-discovers apps defined as YAML specs. Schema changes are reconciled automatically — no migrations to run manually.

```
Workspace (git-managed)          cozybase daemon              Data Directory
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ todo-app/        │        │ Reconciler       │        │ cozybase.sqlite  │
│   app.yaml       │───────>│ Watcher          │───────>│ apps/            │
│   tables/        │ watch  │ HTTP Server      │ apply  │   todo-app/      │
│     todos.yaml   │        │ Event Bus        │        │     db.sqlite    │
│ blog-app/        │        │                  │        │   blog-app/      │
│   app.yaml       │        │                  │        │     db.sqlite    │
│   tables/...     │        │                  │        │                  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
   Source of truth              Engine                    Runtime state
```

## Quick Start

```bash
# Install dependencies
bun install

# Create a workspace with an app
mkdir -p my-workspace/todo-app/tables

cat > my-workspace/todo-app/app.yaml << 'EOF'
description: "A simple todo application"
EOF

cat > my-workspace/todo-app/tables/todos.yaml << 'EOF'
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

# Start the daemon
bun run packages/server/src/index.ts --workspace ./my-workspace
```

Output:

```
Reconciling workspace...
  ✓ [todo-app] create_app: todo-app
  ✓ [todo-app] create_table: todos (4 columns)

  ╔═══════════════════════════════════════╗
  ║           cozybase v0.1.0            ║
  ║  Local BaaS Platform for AI Agents   ║
  ╚═══════════════════════════════════════╝

  Server:    http://0.0.0.0:3000
  Workspace: ./my-workspace
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

### Live Schema Changes

Edit YAML files while the server is running — changes are auto-reconciled:

```bash
# Add a column to todos.yaml, the daemon auto-runs ALTER TABLE
# Console output: ✓ [todo-app] alter_table: todos (+column: priority)
```

## CLI Options

```
bun run packages/server/src/index.ts [options]

Options:
  --workspace <path>   Workspace directory (default: ./workspace)
  --port <number>      Server port (default: 3000)
  --data <path>        Data directory (default: ./data)
```

Environment variables `COZYBASE_WORKSPACE_DIR`, `COZYBASE_PORT`, `COZYBASE_DATA_DIR` are also supported.

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

## Workspace Convention

```
my-workspace/
├── todo-app/                  # Directory name = app name
│   ├── app.yaml               # Required: marks this as an app
│   ├── tables/                # Each .yaml = one table
│   │   ├── todos.yaml
│   │   └── users.yaml
│   ├── functions/             # Each .ts = one function (planned)
│   ├── crons.yaml             # Cron jobs (planned)
│   └── storage.yaml           # Storage buckets (planned)
└── blog-app/
    ├── app.yaml
    └── tables/
        └── posts.yaml
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
    references: users(id)  # Foreign key (planned)

indexes:
  - columns: [email]
    unique: true
  - columns: [score, created_at]
```

## Project Structure

```
cozybase/
├── packages/
│   ├── server/              # Daemon server
│   │   └── src/
│   │       ├── index.ts           # Entry point
│   │       ├── server.ts          # Hono app factory
│   │       ├── config.ts          # Configuration
│   │       ├── core/
│   │       │   ├── db-pool.ts     # SQLite connection pool
│   │       │   ├── workspace.ts   # Workspace scanner + YAML parser
│   │       │   ├── reconciler.ts  # Diff + apply engine
│   │       │   ├── watcher.ts     # fs.watch + debounce
│   │       │   ├── event-bus.ts   # Pub/sub for DB changes
│   │       │   ├── auth.ts        # JWT + API key auth
│   │       │   └── errors.ts      # Error hierarchy
│   │       ├── middleware/
│   │       │   ├── app-resolver.ts
│   │       │   ├── auth.ts
│   │       │   └── logger.ts
│   │       └── modules/
│   │           ├── apps/routes.ts   # Platform status API
│   │           └── db/
│   │               ├── routes.ts        # Auto CRUD
│   │               ├── query-builder.ts # URL → SQL
│   │               ├── schema.ts        # Schema introspection
│   │               └── sql.ts           # Raw SQL execution
│   ├── sdk/                 # TypeScript SDK (planned)
│   └── admin/               # React Admin UI (planned)
├── my-workspace/            # Sample workspace
└── data/                    # Runtime data (gitignored)
```

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **HTTP**: [Hono](https://hono.dev)
- **Database**: SQLite via `bun:sqlite` (WAL mode)
- **Validation**: [Zod](https://zod.dev)
- **Auth**: [jose](https://github.com/panva/jose) (JWT)
- **YAML**: [yaml](https://eemeli.org/yaml/)
- **Cron**: [croner](https://github.com/Hexagon/croner) (planned)

## Roadmap

- [x] Declarative workspace + YAML specs
- [x] Reconciler engine (diff + auto-migrate)
- [x] File watcher with live reconciliation
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
