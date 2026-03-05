# Skill: Modify Schema

Modify the database schema of an existing Cozybase APP by creating a new migration.

## When to Use

Use this skill when the user wants to add/modify tables, columns, or indexes in an existing APP's database.

## Steps

### Step 1: Identify the APP and Changes

- Which APP? (use `list_apps` if needed)
- What schema changes are needed? (new table, new column, new index, etc.)

### Step 2: Review Existing Migrations

Fetch the APP with `fetch_app` if not already in the working directory, then read the existing migration files to understand the current schema.

For migration patterns and SQLite syntax, call `get_guide("db/migrations")`.

### Step 3: Determine Migration Number

List existing migrations and use the next sequential number:
- If last migration is `002_add_users.sql`, create `003_description.sql`

### Step 4: Write the New Migration

Create `migrations/NNN_description.sql`:

```sql
-- Adding a new table
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Adding a column to existing table
ALTER TABLE users ADD COLUMN avatar TEXT;

-- Creating an index
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
```

### Step 5: Update Seeds (Optional)

If needed, update `seeds/` with sample data for the new schema.

### Step 6: Follow the Standard Workflow

Upload, reconcile, test, verify, and publish following the standard development workflow (see `get_guide("workflow")` Steps 3-7).

## Important Rules

- **Never modify published migrations** — they are immutable after `publish_app`
- **Always create new migration files** for schema changes
- Use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` for safety
- SQLite `ALTER TABLE` is limited — you can ADD COLUMN but not DROP or RENAME columns in older SQLite versions
- For complex changes (like renaming a column), create a new table, copy data, drop old, rename new
- Migration file content should be idempotent where possible
