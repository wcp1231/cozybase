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
