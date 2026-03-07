# Development Workflow

Cozybase APP development follows an iterative **get source → edit → upload → rebuild-if-needed → test → verify → publish** lifecycle, where testing loops back to editing and publishing requires explicit human confirmation.

## 1. Get APP Source Code

### New APP

```
create_app(name: "my-app", description: "My application")
```

After creation, template files are written to your working directory. The return value includes a `directory` path and an initial `files` list.

### Existing APP

```
fetch_app(app_name: "my-app")
```

This replaces the working directory contents with the latest state from cozybase. Use your file tools to read the files in the returned `directory`.

## 2. Edit Files

Use your file tools (read/write) to edit files in the working directory:

```
{app-name}/
├── app.yaml              # APP metadata (description)
├── package.json           # npm dependencies (optional)
├── migrations/            # Database migration files
│   └── 001_init.sql
├── seeds/                 # Seed data (optional, Draft only)
├── functions/             # TypeScript functions
│   └── hello.ts
└── ui/
    └── pages.json         # UI page definitions
```

### File Descriptions

- **app.yaml** — APP metadata: `description` and optional `schedules` array (see `get_guide("scheduled-tasks")`)
- **migrations/** — SQL files, named `NNN_name.sql` (e.g. `001_init.sql`), executed in filename sort order
- **seeds/** — Seed data SQL, loaded into the Draft database during rebuild (never applied to Stable)
- **functions/** — TypeScript files that provide API endpoints via HTTP method exports
- **ui/pages.json** — Declarative UI page definitions
- **package.json** — npm dependencies; `bun install` runs automatically during rebuild

### Editing UI Pages

**Always use MCP tools to edit UI. Never manually read or write `ui/pages.json` with file tools.**
**Prefer `ui_batch` for related UI changes** (for example: create page + insert components, or insert + update + move in one edit pass).

Use `ui_batch` as the default UI editing tool:

```
# Batch page + component edits in one call
ui_batch(app_name: "my-app", operations: [
  { op: "page_add", ref: "$usersPage", id: "user-list", title: "User List" },
  { op: "insert", ref: "$title", parent_id: "$usersPage", node: { type: "heading", text: "Users" } },
  { op: "insert", parent_id: "$usersPage", node: { type: "table", api: { url: "/fn/_db/tables/users", method: "GET" }, columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Name" }
  ] } },
  { op: "update", node_id: "$title", props: { text: "User Management" } }
])
```

For one-off edits or inspection, use single-operation tools:

```
pages_list / pages_add / pages_update / pages_reorder / pages_remove
ui_outline / ui_get
ui_insert / ui_update / ui_move / ui_delete
```

After UI edits (`ui_batch` or single-operation tools), sync the working copy back to cozybase:

```
update_app_file(app_name: "my-app", path: "ui/pages.json")
```

#### Why use UI tools instead of raw file editing?

- **IDs are auto-generated** — You don't need to invent unique IDs; the system generates stable `{type}-{nanoid5}` IDs automatically
- **Nested ref wiring is supported** — use exact-match `"$self"` inside `ui_insert` / `ui_batch.insert` payloads, or earlier batch refs like `"$table"` inside `ui_batch.insert` / `ui_batch.update` nested JSON
- **Validated before write** — Every edit is validated against the full schema before writing; invalid edits are rejected without corrupting the file
- **Fewer round trips** — `ui_batch` can complete multiple related edits in one call, reducing repeated read/validate/write cycles
- **Targeted changes** — Use `ui_get` to inspect a specific node, then `ui_update` with only the props you want to change
- **No accidental deletions** — Semantic checks prevent creating dangling references (e.g. a `reload.target` pointing to a deleted node)

#### UI editing workflow

```
fetch_app(app_name: "my-app")          # populate working copy
        │
pages_list(app_name: "my-app")         # see existing pages
        │
pages_add / pages_remove               # add or remove pages
pages_update / pages_reorder
        │
ui_outline(app_name: "my-app")         # explore component structure
        │
ui_batch(app_name: "my-app", ...)      # preferred for multi-step edits
        │
ui_get / ui_insert / ui_update         # fallback for one-off edits
ui_move / ui_delete
        │
update_app_file(path: "ui/pages.json") # sync working copy to cozybase
        │
inspect \`needs_rebuild\` from update result
        │
rebuild_app(app_name: "my-app")        # only when the update said rebuild is required
        │
inspect_ui(app_name: "my-app")         # verify UI renders correctly
```

#### Container types (can have children)

Only these types accept children via insert/move operations (`ui_insert`, `ui_move`, or `ui_batch` with `insert` / `move`):
`page`, `row`, `col`, `card`, `dialog`

Attempting to insert into a non-container type will return an error.

## 3. Upload Changes

After editing, upload files back to cozybase:

```
# Upload all files (recommended)
update_app(app_name: "my-app")

# Or upload a single file
update_app_file(app_name: "my-app", path: "functions/hello.ts")
```

`update_app` scans the entire APP directory and automatically detects added, modified, and deleted files. Published migration files cannot be modified or deleted.

## 4. Rebuild Draft Environment (When Needed)

```
rebuild_app(app_name: "my-app")
```

Rebuild performs the following steps:
1. Destroys the Draft database
2. Executes all migration files in order
3. Loads seed data
4. Exports runtime files
5. Installs npm dependencies
6. Reloads Draft runtime configuration

Run rebuild only when `update_app` / `update_app_file` returns `needs_rebuild: true`.
Typical triggers are changes to migrations, seeds, `package.json`, or `app.yaml`.

## 5. Test & Verify Behavior (Iterative)

After any required rebuild, use these tools to test the Draft environment:

```
# Execute SQL queries
execute_sql(app_name: "my-app", sql: "SELECT * FROM todo")

# Call API endpoints
call_api(app_name: "my-app", method: "GET", path: "/fn/todos")
call_api(app_name: "my-app", method: "GET", path: "/fn/_db/tables/todo")
```

- `execute_sql` operates on the Draft database by default; supports SELECT and DML
- `call_api` can invoke custom functions and built-in CRUD API endpoints

### Iteration Loop

If testing reveals issues:
1. Go back to **Step 2** (Edit Files) and fix the problem
2. Re-upload via `update_app` or `update_app_file` (Step 3)
3. Rebuild via `rebuild_app` only if the last file sync returned `needs_rebuild: true` (Step 4)
4. Test again

Repeat until all behavior is correct.

### Draft Data Isolation

Draft and Stable environments use **completely separate databases**. Any data created during testing (via `execute_sql`, `call_api`, seed data, etc.) only exists in Draft and will never affect Stable data.

- **No cleanup needed** — Do not manually delete test data from Draft
- **Hand off directly** — Once you have verified behavior, ask the user to confirm. The user can also test in the Draft environment without worrying about data contamination

### Human Confirmation Gate

Once all tests pass, **ask the user for confirmation** before proceeding to verify/publish. Do NOT proceed to publish automatically.

## 6. Verify (Pre-publish Validation)

**Always required before publishing.** This validates that all changes can be correctly applied to the Stable environment.

```
verify_app(app_name: "my-app")
```

Verify checks that migrations, functions, and UI can be safely applied to the Stable environment, including dry-running pending migrations on a temporary copy of the Stable database.

If verification fails:
- Go back to **Step 2** to fix the issues
- Re-upload, rebuild when needed, and re-test before trying again

If verification passes, proceed to publish.

## 7. Publish (FINAL Step)

**This is the FINAL step in the development workflow.** Only execute after:
- All tests pass (Step 5)
- User has explicitly confirmed readiness to publish
- `verify_app` passes (Step 6)

```
publish_app(app_name: "my-app")
```

Publish performs the following steps:
1. Backs up the Stable database
2. Executes pending migrations on the Stable database
3. Exports functions and UI to the Stable runtime directory
4. Marks executed migrations as **immutable** (cannot be modified)
5. Cleans up the Draft environment

If publishing fails, the system automatically rolls back to the backup.

## Typical Development Cycle

```
1. create_app / fetch_app
            │
2. edit files ◄──────────────────┐
            │                    │
3. update_app                    │
            │                    │
4. rebuild_app if needed         │
            │                    │
5. test (execute_sql / call_api) │
            │                    │
       issues found? ─── yes ────┘
            │
            no
            │
      human confirmation
            │
6. verify_app
            │
       pass / fail?
       │         │
     pass      fail ──► back to 2
       │
       ▼
7. publish_app (FINAL)
```
