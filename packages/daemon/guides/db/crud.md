# Database CRUD API

Cozybase automatically generates RESTful CRUD endpoints for every user table in each APP, with no code required.

## Endpoints

All database API endpoints are mounted under the `/fn/_db/` prefix:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/fn/_db/tables/{table}` | List records (supports filtering/sorting/pagination) |
| GET | `/fn/_db/tables/{table}/{id}` | Get a single record |
| POST | `/fn/_db/tables/{table}` | Create a record |
| PATCH | `/fn/_db/tables/{table}/{id}` | Update a record |
| DELETE | `/fn/_db/tables/{table}/{id}` | Delete a record |
| GET | `/fn/_db/schemas` | Get database schema information |
| POST | `/fn/_db/sql` | Execute raw SQL (permission-controlled) |

Table name rules: only letters, numbers, and underscores are allowed. Names starting with `_` or `sqlite_` are blocked (internal tables are protected).

## Query Parameters

GET `/fn/_db/tables/{table}` supports the following query parameters:

### select — Column Selection

```
?select=id,title,created_at
```

Returns all columns by default.

### where — Filtering

Format: `column.operator.value`

```
?where=status.eq.active
?where=age.gte.18&where=status.eq.active
```

Multiple where conditions are joined with AND.

**Supported operators:**

| Operator | SQL | Example |
|----------|-----|---------|
| `eq` | `=` | `status.eq.active` |
| `neq` | `!=` | `status.neq.deleted` |
| `gt` | `>` | `age.gt.18` |
| `gte` | `>=` | `age.gte.18` |
| `lt` | `<` | `price.lt.100` |
| `lte` | `<=` | `price.lte.100` |
| `like` | `LIKE` | `name.like.%john%` |
| `ilike` | `LIKE` (case-insensitive) | `name.ilike.%john%` |
| `is` | `IS` | `deleted_at.is.null` |
| `in` | `IN` | `status.in.active,pending` |

**Automatic value type coercion:**
- Integers: `/^-?\d+$/` → number
- Floats: `/^-?\d+\.\d+$/` → number
- Booleans: `true` → 1, `false` → 0
- `null` → NULL (use with the `is` operator)
- Everything else → string

### order — Sorting

Format: `column.direction`, multiple columns separated by commas.

```
?order=created_at.desc
?order=status.asc,created_at.desc
```

### limit & offset — Pagination

```
?limit=20&offset=40
```

Default limit is 1000 (maximum).

## Create Record

POST `/fn/_db/tables/{table}`

```json
{
  "title": "New todo",
  "completed": 0
}
```

- If the primary key is TEXT type, the system generates a nanoid automatically
- If the primary key is INTEGER type, AUTOINCREMENT is used

Returns the complete created record.

## Update Record

PATCH `/fn/_db/tables/{table}/{id}`

```json
{
  "completed": 1
}
```

Only updates the provided fields. Returns the complete updated record.

## Delete Record

DELETE `/fn/_db/tables/{table}/{id}`

Returns `{ success: true }`.

## Usage in UI

UI components call the CRUD API through the `api` configuration:

```json
{
  "type": "table",
  "api": {
    "url": "/fn/_db/tables/todo",
    "params": {
      "order": "created_at.desc",
      "where": "completed.eq.0"
    }
  }
}
```

API URLs use APP-relative paths; the system automatically resolves them to full URLs.

## Permission Model

| Mode | Allowed Operations |
|------|-------------------|
| Draft | SELECT, INSERT, UPDATE, DELETE |
| Stable | SELECT, INSERT, UPDATE, DELETE |

DDL operations (CREATE/DROP/ALTER) are always forbidden — use migration files to manage schema.
