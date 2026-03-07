# Skill: Add Scheduled Task

Add a cron-scheduled task to an existing Cozybase APP.

## When to Use

Use this skill when the user wants to run a function on a recurring schedule (e.g. periodic cleanup, data sync, report generation).

## Steps

### Step 1: Identify the APP and Requirements

- Which APP? (use `list_apps` if needed)
- What should the task do?
- How often should it run? (cron schedule)
- Any concurrency concerns?

### Step 2: Write the Function

Fetch the APP with `fetch_app` if not already in the working directory, then create (or reuse) a `.ts` file in `functions/`.

For the full FunctionContext API reference, call `get_guide("functions")`.
For scheduled task configuration details, call `get_guide("scheduled-tasks")`.

Key points:
- `ctx.trigger` is `'cron'` — there is no HTTP request (`ctx.req` is `undefined`)
- Return a value if you want the manual trigger response to include structured output
- The function can also handle HTTP requests if you check `ctx.trigger`

### Step 3: Configure the Schedule in app.yaml

Add an entry to the `schedules` array in `app.yaml`:

```yaml
description: My application

schedules:
  - name: daily-cleanup
    cron: "0 2 * * *"
    function: cleanup
```

### Step 4: Sync, Rebuild, Test, Verify, Publish

Follow the standard development workflow (see `get_guide("workflow")` Steps 3-7):

- Upload changes with `update_app(app_name: "<app-name>")`
- Inspect `needs_rebuild` in the response
- Run `rebuild_app(app_name: "<app-name>")` when `needs_rebuild` is `true`
- Test the scheduled function in Draft before publishing
- Run `verify_app` before publishing
- Ask for explicit user confirmation before `publish_app`

Schedules only activate in the Stable environment after publishing.

## Tips

- Default concurrency is `skip` — safe for most tasks
- Test the function manually with `call_api` before publishing (it will run with `ctx.trigger='http'`)
- Use `filename:exportName` format to reference a named export (e.g. `sync:run`)
- Set `enabled: false` to temporarily disable a schedule without removing it
- Use `timezone` and `timeout` explicitly when the task depends on business-local time or long-running work
