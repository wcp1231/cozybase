# Cozybase Agent Workspace

You are working in a Cozybase workspace. Cozybase is a local Backend-as-a-Service (BaaS) platform that lets you create and manage APPs through MCP tools.

## What You Can Do

- **Create APPs** — Scaffold new applications with database, API functions, and UI
- **Write Functions** — TypeScript API endpoints with database access
- **Define UI** — Declarative JSON-based pages with 26 built-in components
- **Manage Database** — SQLite schema via migrations, auto-generated CRUD API
- **Publish** — Promote Draft changes to Stable with migration safety checks

## Development Workflow

```
create_app → edit files → update_app → reconcile_app → test → verify_app → publish_app
```

1. **create_app** — Create a new APP (scaffolds template files)
2. **Edit files** — Use your file tools to modify the APP directory
3. **update_app** / **update_app_file** — Sync edited files back to cozybase
4. **reconcile_app** — Rebuild Draft environment (runs migrations, loads seeds, exports functions)
5. **Test** — Use `execute_sql` and `call_api` to verify behavior
6. **verify_app** — Dry-run pending migrations against Stable
7. **publish_app** — Apply changes to Stable (makes migrations immutable)

## APP Directory Structure

```
{app-name}/
├── app.yaml              # APP metadata (description)
├── package.json          # npm dependencies (optional)
├── migrations/           # Database schema (NNN_name.sql)
│   └── 001_init.sql
├── seeds/                # Development seed data (optional, Draft only)
├── functions/            # TypeScript API functions
│   └── hello.ts          # → GET/POST/... /fn/hello
└── ui/
    └── pages.json        # UI page definitions
```

## MCP Tools

| Tool | Purpose |
|------|---------|
| `create_app` | Create a new APP |
| `list_apps` | List all APPs |
| `fetch_app` | Fetch APP files to working directory |
| `update_app` | Sync all files to cozybase |
| `update_app_file` | Sync a single file |
| `delete_app` | Delete an APP |
| `reconcile_app` | Rebuild Draft environment |
| `verify_app` | Verify publish safety |
| `publish_app` | Publish to Stable |
| `execute_sql` | Run SQL on APP database |
| `call_api` | Call APP HTTP endpoints |
| `get_guide` | Get detailed reference docs |

## Reference Documentation

Use `get_guide(topic)` to access detailed documentation on any topic:

### Top-level Topics

| Topic | Description |
|-------|-------------|
| `workflow` | Complete development lifecycle |
| `functions` | Writing TypeScript functions (FunctionContext API) |
| `ui` | UI system overview |
| `db` | Database system overview |

### UI Subtopics

| Topic | Description |
|-------|-------------|
| `ui/components` | Component quick-reference (26 built-in types) |
| `ui/components/table` | Table component (columns, row actions, filtering) |
| `ui/components/form` | Form component (fields, validation, submission) |
| `ui/components/dialog` | Dialog patterns (create, edit, view) |
| `ui/actions` | Action system (api, reload, dialog, link, close, confirm) |
| `ui/expressions` | Expression engine (`${...}` syntax, scopes) |

### Database Subtopics

| Topic | Description |
|-------|-------------|
| `db/crud` | Auto CRUD API reference (REST endpoints, query operators) |
| `db/migrations` | Migration patterns (naming, SQLite syntax, immutability) |

### Usage Examples

```
get_guide("workflow")              # Full development flow
get_guide("ui/components")         # All 26 components
get_guide("ui/components/table")   # Table component deep-dive
get_guide("db/crud")               # CRUD API query syntax
```

## Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| create-app | `/create-app` | Guided workflow to create a complete APP from scratch |
| add-function | `/add-function` | Add a new TypeScript function to an existing APP |
| add-page | `/add-page` | Add a new UI page to an existing APP |
| modify-schema | `/modify-schema` | Modify database schema with a new migration |

## Key Conventions

- **API URLs** in UI use APP-relative paths: `/fn/_db/tables/todo`, `/fn/my-function`
- **Migrations** are named `NNN_description.sql` (e.g., `001_init.sql`)
- **Functions** export HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `default`
- **Expressions** use `${...}` syntax: `${row.title}`, `${form.name}`, `${status-tabs.value}`
- **Seeds** only load into Draft (not Stable) — use for dev/test data
- Published migrations become **immutable** — always create new migrations for changes
