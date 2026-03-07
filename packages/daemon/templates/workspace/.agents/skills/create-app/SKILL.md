# Skill: Create APP

Create a new Cozybase APP from scratch with database schema, API functions, and UI pages.

## When to Use

Use this skill when the user wants to create a new application from scratch.

## Steps

### Step 1: Understand Requirements

Ask the user what the APP should do:
- What data does it manage? (e.g., tasks, users, products)
- What operations are needed? (e.g., CRUD, filtering, status changes)
- What UI is needed? (e.g., table listing, create/edit forms)

### Step 2: Create the APP

```
create_app(name: "<app-name>", description: "<description>")
```

### Step 3: Write Database Migrations

Create `migrations/001_init.sql` with the database schema.

For SQLite syntax and migration patterns, call `get_guide("db/migrations")`.

### Step 4: Write Seed Data (Optional)

Create `seeds/sample_data.sql` with development test data.

### Step 5: Write Functions

Create TypeScript files in `functions/` for custom API logic.

For FunctionContext API and export conventions, call `get_guide("functions")`.

Note: If the built-in CRUD API (`/fn/_db/tables/{table}`) is sufficient, you may not need custom functions.

### Step 6: Write UI Pages

Use MCP UI tools to define the UI (do not manually edit `ui/pages.json`).
Prefer `ui_batch` for multi-step UI composition.

For the component reference, call `get_guide("ui/components")`.
For actions (API calls, dialogs, navigation), call `get_guide("ui/actions")`.
For expression syntax (`${...}`), call `get_guide("ui/expressions")`.

Typical flow:

```
pages_add(app_name: "<app-name>", id: "dashboard", title: "Dashboard")

ui_batch(app_name: "<app-name>", operations: [
  { op: "insert", ref: "$stats", parent_id: "dashboard", node: { type: "row", children: [] } },
  { op: "insert", parent_id: "$stats", node: { type: "stat", label: "Total", value: "${rows.length}" } }
])
```

### Step 7: Sync, Rebuild if Needed, Test, Verify, Publish

Follow the standard development workflow (see `get_guide("workflow")` Steps 3-7):

- Upload the working copy with `update_app(app_name: "<app-name>")`
- Inspect the response for `needs_rebuild`
- Run `rebuild_app(app_name: "<app-name>")` only if `needs_rebuild` is `true`
- Test Draft behavior with `call_api`, `execute_sql`, and `inspect_ui`
- Run `verify_app` before publishing
- Ask for explicit user confirmation before `publish_app`

For new apps, a rebuild is usually required because the initial upload commonly includes `migrations/`, `app.yaml`, or `package.json`.

## Tips

- Start with a simple migration, then iterate
- Use the Auto CRUD API (`/fn/_db/tables/{table}`) for standard operations — write custom functions only for complex logic
- In UI, use `${row.xxx}` in table columns and row actions to reference current row data
- Use `{ "type": "reload", "target": "<table-id>" }` after mutations to refresh data
- Use `{ "type": "close" }` in form `onSuccess` to close dialogs
- **Split complex apps into multiple pages** — Design one page per logical concern (e.g., list page, detail page, settings page). Use navigation actions to link between them
