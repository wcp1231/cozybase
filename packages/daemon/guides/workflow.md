# Development Workflow

Cozybase APP development follows an iterative **get source → edit → upload → reconcile → test → verify → publish** lifecycle, where testing loops back to editing and publishing requires explicit human confirmation.

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

- **app.yaml** — Contains only the `description` field
- **migrations/** — SQL files, named `NNN_name.sql` (e.g. `001_init.sql`), executed in filename sort order
- **seeds/** — Seed data SQL, loaded into the Draft database during reconcile (never applied to Stable)
- **functions/** — TypeScript files that provide API endpoints via HTTP method exports
- **ui/pages.json** — Declarative UI page definitions
- **package.json** — npm dependencies; `bun install` runs automatically during reconcile

### Editing UI Pages with Page Tools (Recommended)

Instead of reading and writing `ui/pages.json` directly with file tools, use the **page editing tools** for structured, validated edits:

```
# 1. Get a structural overview of all pages
page_outline(app_name: "my-app")

# 2. Inspect a specific node by ID
page_get(app_name: "my-app", node_id: "btn-save-a7x3k")

# 3. Insert a new component into a container node
page_insert(app_name: "my-app", parent_id: "row-main-9kp2r", node: {
  type: "text",
  text: "Hello world"
})

# 4. Update properties of an existing node (cannot change id or type)
page_update(app_name: "my-app", node_id: "txt-greeting-p1q8s", props: { text: "Welcome back" })

# 5. Move a node to a new parent
page_move(app_name: "my-app", node_id: "btn-save-a7x3k", new_parent_id: "card-footer-xz21b")

# 6. Delete a node and its entire subtree
page_delete(app_name: "my-app", node_id: "row-old-m4k9j")
```

After page edits, sync the working copy back to cozybase:

```
update_app_file(app_name: "my-app", path: "ui/pages.json")
```

#### Why use page tools instead of raw file editing?

- **IDs are auto-generated** — You don't need to invent unique IDs; the system generates stable `{type}-{nanoid5}` IDs automatically
- **Validated before write** — Every edit is validated against the full schema before writing; invalid edits are rejected without corrupting the file
- **Targeted changes** — Use `page_get` to inspect a specific node, then `page_update` with only the props you want to change
- **No accidental deletions** — Semantic checks prevent creating dangling references (e.g. a `reload.target` pointing to a deleted node)

#### Page tool workflow

```
fetch_app(app_name: "my-app")         # populate working copy
        │
page_outline(app_name: "my-app")      # explore the page structure
        │
page_get / page_insert                 # inspect and edit nodes
page_update / page_move / page_delete
        │
update_app_file(path: "ui/pages.json") # sync working copy to cozybase
        │
reconcile_app(app_name: "my-app")     # rebuild Draft with new UI
        │
inspect_ui(app_name: "my-app")        # verify UI renders correctly
```

#### Container types (can have children)

Only these types accept children via `page_insert` or `page_move`:
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

## 4. Reconcile (Rebuild Draft Environment)

```
reconcile_app(app_name: "my-app")
```

Reconcile performs the following steps:
1. Destroys the Draft database
2. Executes all migration files in order
3. Loads seed data
4. Exports functions to the runtime directory
5. Exports UI definitions
6. Installs npm dependencies

Run reconcile after every change to migrations, seeds, or functions.

## 5. Test & Verify Behavior (Iterative)

After reconcile, use these tools to test the Draft environment:

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
3. Re-reconcile via `reconcile_app` (Step 4)
4. Test again

Repeat until all behavior is correct.

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
- Re-upload, re-reconcile, and re-test before trying again

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
4. reconcile_app                 │
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
