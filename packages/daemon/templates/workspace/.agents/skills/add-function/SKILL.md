# Skill: Add Function

Add a new TypeScript API function to an existing Cozybase APP.

## When to Use

Use this skill when the user wants to add a new API endpoint or server-side logic to an existing APP.

## Steps

### Step 1: Identify the APP and Requirements

- Which APP? (use `list_apps` if needed)
- What should the function do?
- What HTTP methods are needed? (GET, POST, etc.)
- Does it need database access?

### Step 2: Write the Function

Fetch the APP with `fetch_app` if not already in the working directory, then create a new `.ts` file in the APP's `functions/` directory.

For the full FunctionContext API reference, call `get_guide("functions")`.

Key points:
- File name = route path: `functions/hello.ts` → `/fn/hello`
- Export HTTP methods: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, or `default`
- Use `ctx.db.query()` for SELECT, `ctx.db.run()` for INSERT/UPDATE/DELETE
- Return objects/arrays for auto JSON serialization
- Return `Response` for custom status codes

### Step 3: Sync and Test with the Current Workflow

Follow the standard development workflow (see `get_guide("workflow")` Steps 3-7):

- Upload the function with `update_app_file(app_name: "<app-name>", path: "functions/<file>.ts")` or `update_app(app_name: "<app-name>")`
- Inspect `needs_rebuild` in the response
- Function source changes normally hot-export into Draft, so rebuild is usually not required
- Only run `rebuild_app(app_name: "<app-name>")` if the upload result says `needs_rebuild: true`
- Test the function via `call_api`
- Run `verify_app` before publishing
- Ask for explicit user confirmation before `publish_app`

## Tips

- Check existing functions first to avoid duplicate routes
- Use `ctx.db.query()` with parameterized queries: `ctx.db.query('SELECT * FROM todo WHERE id = ?', [id])`
- Parse request body with `await ctx.req.json()` and URL params with `new URL(ctx.req.url).searchParams`
