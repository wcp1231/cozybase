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

This creates a scaffold in the working directory with template files.

### Step 3: Write Database Migrations

Create `migrations/001_init.sql` with the database schema.

For SQLite syntax and migration patterns, call:
```
get_guide("db/migrations")
```

### Step 4: Write Seed Data (Optional)

Create `seeds/sample_data.sql` with development test data.

Seeds only load into Draft — good for testing.

### Step 5: Write Functions

Create TypeScript files in `functions/` for custom API logic.

For FunctionContext API and export conventions, call:
```
get_guide("functions")
```

Note: If the built-in CRUD API (`/fn/_db/tables/{table}`) is sufficient, you may not need custom functions.

### Step 6: Write UI Pages

Edit `ui/pages.json` to define the UI.

For the component reference, call:
```
get_guide("ui/components")
```

For actions (API calls, dialogs, navigation), call:
```
get_guide("ui/actions")
```

For expression syntax (`${...}`), call:
```
get_guide("ui/expressions")
```

### Step 7: Sync and Reconcile

```
update_app(app_name: "<app-name>")
reconcile_app(app_name: "<app-name>")
```

### Step 8: Test

```
# Test database
execute_sql(app_name: "<app-name>", sql: "SELECT * FROM <table>")

# Test API endpoints
call_api(app_name: "<app-name>", method: "GET", path: "/fn/_db/tables/<table>")
```

### Step 9: Verify and Publish

```
verify_app(app_name: "<app-name>")
publish_app(app_name: "<app-name>")
```

## Tips

- Start with a simple migration, then iterate
- Use the Auto CRUD API (`/fn/_db/tables/{table}`) for standard operations — write custom functions only for complex logic
- In UI, use `${row.xxx}` in table columns and row actions to reference current row data
- Use `{ "type": "reload", "target": "<table-id>" }` after mutations to refresh data
- Use `{ "type": "close" }` in form `onSuccess` to close dialogs
