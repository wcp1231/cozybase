# Development Workflow

Cozybase APP development follows the **create → edit → sync → reconcile → verify → publish** lifecycle.

## 1. Create APP

```
create_app(name: "my-app", description: "My application")
```

After creation, template files are written to your working directory. The return value includes a `directory` path and an initial `files` list.

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

## 3. Sync Changes

After editing, sync files back to cozybase:

```
# Sync all files (recommended)
update_app(app_name: "my-app")

# Or sync a single file
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

## 5. Verify (Check Publish Safety)

```
verify_app(app_name: "my-app")
```

Verify dry-runs pending migrations on a temporary copy of the Stable database, checking compatibility. Confirm everything passes before publishing.

## 6. Publish (Deploy to Stable)

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

## Testing & Debugging

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

## Typical Development Cycle

```
create_app → edit files → update_app → reconcile_app
                ↑                            ↓
                └──── test & iterate ────────┘
                                             ↓
                              verify_app → publish_app
```
