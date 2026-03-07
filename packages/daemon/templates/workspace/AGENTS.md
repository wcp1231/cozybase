# Cozybase Agent Workspace

You are working in a Cozybase workspace. Cozybase is a local Backend-as-a-Service (BaaS) platform that lets you create and manage APPs through MCP tools.

## What You Can Do

- **Create APPs** — Scaffold new applications with database, API functions, and UI
- **Write Functions** — TypeScript API endpoints with database access
- **Define UI** — Declarative JSON-based pages with 26 built-in components
- **Manage Database** — SQLite schema via migrations, auto-generated CRUD API
- **Publish** — Promote Draft changes to Stable with migration safety checks
- **Schedule Tasks** — Cron-based scheduled function execution via app.yaml

## Development Workflow

```
get source → edit → upload → rebuild if needed → test ←─(iterate if issues)
                                                    │
                                              human confirmation
                                                    │
                                               verify_app → publish (FINAL)
```

1. **Get APP source** — `create_app` (new) or `fetch_app` (existing)
2. **Edit files** — Modify the APP directory
3. **Upload** — `update_app` or `update_app_file`
4. **Rebuild if needed** — `rebuild_app` when `needs_rebuild` is `true`
5. **Test** — `execute_sql` and `call_api` (iterate back to 2 if issues; get **human confirmation** when done)
6. **Verify** — `verify_app` (required before publish; iterate back to 2 if fails)
7. **Publish** — `publish_app` (**FINAL step**, only after human confirms and verify passes)

For detailed workflow documentation, call `get_guide("workflow")`.

## Available Skills

| Skill | Trigger | Purpose |
|-------|---------|---------|
| create-app | `/create-app` | Create a complete APP from scratch |
| add-function | `/add-function` | Add a TypeScript API function to an existing APP |
| edit-ui | `/edit-ui` | Create or edit UI pages in an existing APP |
| add-scheduled-task | `/add-scheduled-task` | Add a cron-scheduled task to an existing APP |
| modify-schema | `/modify-schema` | Modify database schema with a new migration |

## UI Editing Rules

**Always use MCP tools to edit UI. Never manually edit `ui/pages.json`.**
**Prefer `ui_batch` for multi-step or related UI edits.** Use single-operation `ui_*` / `pages_*` tools only for one-off edits or debugging.

| Operation | Tool |
|-----------|------|
| Batch edit pages/components (preferred) | `ui_batch` |
| List pages | `pages_list` |
| Add a page | `pages_add` |
| Remove a page | `pages_remove` |
| Rename a page | `pages_update` |
| Reorder pages | `pages_reorder` |
| View component tree | `ui_outline` |
| Get component details | `ui_get` |
| Add a component | `ui_insert` |
| Edit a component | `ui_update` |
| Move a component | `ui_move` |
| Delete a component | `ui_delete` |

After any UI edit, call `update_app_file` with path `ui/pages.json` to sync to Cozybase.

## Key Conventions

- **API URLs** in UI use APP-relative paths: `/fn/_db/tables/todo`, `/fn/my-function`
- **Migrations** are named `NNN_description.sql` (e.g., `001_init.sql`)
- **Functions** export HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `default`
- **Expressions** use `${...}` syntax: `${row.title}`, `${form.name}`, `${status-tabs.value}`
- **Seeds** only load into Draft (not Stable) — use for dev/test data
- Published migrations become **immutable** — always create new migrations for changes
- **Scheduled Tasks** are configured in `app.yaml` under `schedules` — see `get_guide("scheduled-tasks")`
- **Draft / Stable data isolation** — Draft and Stable use separate databases. Test data created in Draft never affects Stable, so there is no need to clean up test data. Once you finish editing and testing, hand off directly to the user for confirmation
- **Split pages by logical concern** — When requirements are complex, create separate pages for each logical unit (e.g., listing, detail, settings) instead of putting everything on a single page
