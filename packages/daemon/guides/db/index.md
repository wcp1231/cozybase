# Database

Cozybase uses SQLite as the APP database, providing two data access methods:

1. **Auto CRUD API** — Built-in RESTful endpoints automatically generated for every table
2. **Custom Functions** — Direct database access via `ctx.db` in TypeScript functions

## Core Concepts

### Draft / Stable Dual Environments

Each APP has two independent database instances:

- **Draft** — Development environment, rebuilt from scratch during `rebuild_app` when required (runs all migrations + seeds)
- **Stable** — Production environment, `publish_app` only applies new pending migrations

### Migrations

Database schema is managed through migration SQL files stored in the `migrations/` directory.

See `get_guide("db/migrations")` for details.

### Auto CRUD API

Every user table automatically gets standard REST endpoints with filtering, sorting, and pagination.

See `get_guide("db/crud")` for details.
