# Migrations

Migrations are SQL files that manage the database schema, stored in the APP's `migrations/` directory.

## Naming Convention

```
migrations/NNN_description.sql
```

- **NNN** — Three-digit zero-padded prefix (001, 002, 003...)
- **description** — Short description using underscores
- Files are executed in filename sort order

Examples:
```
migrations/001_init.sql
migrations/002_add_users.sql
migrations/003_add_index_on_email.sql
```

## Writing Rules

### Use SQLite Syntax

Cozybase uses SQLite. Note the differences from other databases:

```sql
-- Auto-increment integer primary key
CREATE TABLE todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SQLite has no BOOLEAN type — use INTEGER (0/1)
-- SQLite has no native DATETIME type — use TEXT to store ISO strings
```

### Common Patterns

```sql
-- Create table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add column
ALTER TABLE users ADD COLUMN avatar TEXT;

-- Create index
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Insert seed data (can also be placed in seeds/ directory)
INSERT INTO categories (name) VALUES ('General');
INSERT INTO categories (name) VALUES ('Work');
```

### Each Migration Should Be Atomic

A single migration file should complete one logical change. It can contain multiple SQL statements.

```sql
-- 002_add_tags.sql
CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS todo_tag (
  todo_id INTEGER NOT NULL REFERENCES todo(id),
  tag_id INTEGER NOT NULL REFERENCES tag(id),
  PRIMARY KEY (todo_id, tag_id)
);
```

## Immutable Mechanism

Migrations become **immutable** after publishing (`publish_app`):

1. `publish_app` applies pending migrations to the Stable database
2. After successful execution, those migration files are marked as immutable
3. **Immutable migrations cannot be modified or deleted**

This ensures the Stable database schema evolution history cannot be tampered with.

### Best Practices

- **Never modify published migrations** — always create new migration files to change the schema
- **Adding tables/columns** → write a new migration
- **Modifying existing columns** → write a new migration (SQLite's ALTER TABLE is limited; complex changes require table rebuilding)

## Execution Timing

| Operation | Behavior |
|-----------|----------|
| `rebuild_app` | Destroys Draft database, executes **all** migrations from scratch, then loads seeds |
| `verify_app` | Dry-runs **pending** migrations on a copy of the Stable database |
| `publish_app` | Executes **pending** migrations on the Stable database, marks them as immutable |

**Pending migrations** = migrations not yet executed on the Stable database.

## Seeds (Seed Data)

Seed data files go in the `seeds/` directory as plain SQL files:

```sql
-- seeds/sample_data.sql
INSERT INTO todo (title, completed) VALUES ('Learn cozybase', 1);
INSERT INTO todo (title, completed) VALUES ('Build my first app', 0);
```

Seeds characteristics:
- Only loaded into the Draft database during `rebuild_app`
- **Not** applied to the Stable database
- Suitable for development and test data
