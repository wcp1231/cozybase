# Functions

Functions are TypeScript files placed in the APP's `functions/` directory. They provide API endpoints via HTTP method exports.

## Basic Structure

Each function file maps to an API path: `/fn/{filename}` (without the `.ts` extension).

```typescript
// functions/hello.ts → GET /fn/hello
export function GET(ctx) {
  return { message: "Hello, World!" };
}
```

## HTTP Method Exports

Supported export patterns:

```typescript
// Export specific HTTP methods
export function GET(ctx) { ... }
export function POST(ctx) { ... }
export function PUT(ctx) { ... }
export function PATCH(ctx) { ... }
export function DELETE(ctx) { ... }
export function HEAD(ctx) { ... }
export function OPTIONS(ctx) { ... }

// Export default to handle all methods
export default function(ctx) { ... }
```

Rules:
- If a specific method export exists (e.g. `GET`), that method uses the corresponding export
- If only `default` is exported, all methods call default
- Functions can be `async` or synchronous

## FunctionContext

Each function receives a `ctx` parameter with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `ctx.req` | `Request \| undefined` | Web standard Request object（HTTP 触发时存在，cron 触发时为 `undefined`） |
| `ctx.db` | `DatabaseClient` | Database operations interface |
| `ctx.env` | `Record<string, string>` | Environment variables |
| `ctx.app` | `{ name: string }` | APP metadata |
| `ctx.mode` | `'stable' \| 'draft'` | Current runtime mode |
| `ctx.trigger` | `'http' \| 'cron'` | Trigger source |
| `ctx.log` | `Logger` | Logging interface |
| `ctx.fetch` | `typeof fetch` | Global fetch |
| `ctx.platform` | `PlatformClient` | Platform access client |

### ctx.db — Database Operations

```typescript
// Query (returns array of rows)
const rows = ctx.db.query<{ id: number; title: string }>(
  'SELECT * FROM todo WHERE completed = ?',
  [0]
);

// Write (returns changes and lastInsertRowid)
const result = ctx.db.run(
  'INSERT INTO todo (title) VALUES (?)',
  ['New todo']
);
// result.changes = 1, result.lastInsertRowid = 5

// Execute multiple statements (no return value)
ctx.db.run(`
  UPDATE todo SET completed = 1 WHERE id = 1;
  UPDATE todo SET completed = 1 WHERE id = 2;
`);
```

### ctx.log — Logging Interface

```typescript
ctx.log.info('Processing request');
ctx.log.warn('Deprecated API used', { endpoint: '/old' });
ctx.log.error('Failed to process', { error: err.message });
ctx.log.debug('Debug info', { data: someData });
```

## Return Value Handling

- Return a plain object/array → automatically serialized as JSON with status 200
- Return a `Response` object → returned directly (allows custom status codes and headers)
- Return `null`/`undefined` → empty response

```typescript
// Automatic JSON serialization
export function GET(ctx) {
  return { items: [1, 2, 3] };
}

// Custom Response
export function POST(ctx) {
  return new Response(JSON.stringify({ error: 'Bad request' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### Returning Data for Table / List Components

The `table` and `list` UI components expect the API response to contain a `data` array: `{ "data": [...] }`. The built-in CRUD API (`/fn/_db/tables/{table}`) returns this format automatically, but custom functions **must** wrap query results explicitly:

```typescript
// ✅ Correct — Table/List will display the data
export function GET(ctx) {
  const rows = ctx.db.query('SELECT * FROM todo ORDER BY created_at DESC');
  return { data: rows };
}

// ❌ Wrong — returning a plain array, Table/List will show nothing
export function GET(ctx) {
  return ctx.db.query('SELECT * FROM todo');
}
```

## Reading Request Data

```typescript
export async function POST(ctx) {
  if (!ctx.req) {
    return new Response(JSON.stringify({ error: 'HTTP request is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Read JSON body
  const body = await ctx.req.json();

  // Read URL parameters
  const url = new URL(ctx.req.url);
  const status = url.searchParams.get('status');

  // Read headers
  const auth = ctx.req.headers.get('Authorization');
}
```

## Full Example

```typescript
// functions/todos.ts

export async function GET(ctx) {
  if (!ctx.req) {
    return { data: [] };
  }

  const url = new URL(ctx.req.url);
  const status = url.searchParams.get('status');

  let rows;
  if (status === 'completed') {
    rows = ctx.db.query('SELECT * FROM todo WHERE completed = 1 ORDER BY created_at DESC');
  } else if (status === 'pending') {
    rows = ctx.db.query('SELECT * FROM todo WHERE completed = 0 ORDER BY created_at DESC');
  } else {
    rows = ctx.db.query('SELECT * FROM todo ORDER BY created_at DESC');
  }
  return { data: rows };
}

export async function POST(ctx) {
  if (!ctx.req) {
    return new Response(JSON.stringify({ error: 'HTTP request is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await ctx.req.json();
  const title = body?.title?.trim?.();

  if (!title) {
    return new Response(JSON.stringify({ error: 'title is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = ctx.db.run('INSERT INTO todo (title) VALUES (?)', [title]);
  const todo = ctx.db.query('SELECT * FROM todo WHERE id = ?', [result.lastInsertRowid]);
  return todo[0];
}

export async function DELETE(ctx) {
  if (!ctx.req) {
    return new Response(JSON.stringify({ error: 'HTTP request is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await ctx.req.json();
  const id = body?.id;

  if (id == null) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  ctx.db.run('DELETE FROM todo WHERE id = ?', [id]);
  return { success: true, deleted: id };
}
```

## File Naming Rules

- The filename is the route path: `functions/hello.ts` → `/fn/hello`
- Do not start with `_` (files starting with underscore are ignored)
- Use the `.ts` extension
