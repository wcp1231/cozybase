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
get source → edit → upload → reconcile → test ←─(iterate if issues)
                                           │
                                     human confirmation
                                           │
                                      verify_app → publish (FINAL)
```

1. **Get APP source** — `create_app` (new) or `fetch_app` (existing)
2. **Edit files** — Modify the APP directory
3. **Upload** — `update_app` or `update_app_file`
4. **Reconcile** — `reconcile_app`
5. **Test** — `execute_sql` and `call_api` (iterate back to 2 if issues; get **human confirmation** when done)
6. **Verify** — `verify_app` (required before publish; iterate back to 2 if fails)
7. **Publish** — `publish_app` (**FINAL step**, only after human confirms and verify passes)

For detailed workflow documentation, call `get_guide("workflow")`.

## Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| create-app | `/create-app` | Create a complete APP from scratch |
| add-function | `/add-function` | Add a TypeScript API function to an existing APP |
| add-page | `/add-page` | Add a UI page to an existing APP |
| modify-schema | `/modify-schema` | Modify database schema with a new migration |

## Key Conventions

- **API URLs** in UI use APP-relative paths: `/fn/_db/tables/todo`, `/fn/my-function`
- **Migrations** are named `NNN_description.sql` (e.g., `001_init.sql`)
- **Functions** export HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `default`
- **Expressions** use `${...}` syntax: `${row.title}`, `${form.name}`, `${status-tabs.value}`
- **Seeds** only load into Draft (not Stable) — use for dev/test data
- Published migrations become **immutable** — always create new migrations for changes
