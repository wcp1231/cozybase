# Scheduled Tasks

Scheduled tasks run TypeScript functions on a cron schedule. They are configured in `app.yaml` and execute automatically in the **Stable** environment after publishing.

## Configuration

Add a `schedules` array to `app.yaml`:

```yaml
description: My application

schedules:
  - name: daily-cleanup
    cron: "0 2 * * *"
    function: cleanup
    enabled: true
    concurrency: skip
    timezone: UTC
    timeout: 30000

  - name: hourly-sync
    cron: "0 * * * *"
    function: sync:run
```

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `name` | string | yes | — | Unique name for the schedule |
| `cron` | string | yes | — | Cron expression (5 or 6 fields) |
| `function` | string | yes | — | Function reference (see below) |
| `enabled` | boolean | no | `true` | Set `false` to disable without removing |
| `concurrency` | string | no | `"skip"` | Concurrency policy: `skip`, `queue`, or `parallel` |
| `timezone` | string | no | `"UTC"` | IANA timezone for cron evaluation |
| `timeout` | number | no | `30000` | Execution timeout in milliseconds |

## Function Reference Format

The `function` field references a file in the `functions/` directory:

| Format | Example | Resolves to |
|--------|---------|-------------|
| `filename` | `cleanup` | `functions/cleanup.ts` → `default` export |
| `filename:exportName` | `sync:run` | `functions/sync.ts` → `run` export |

File name must match `[a-zA-Z0-9_-]+`. Export name must be a valid JS identifier.

## Writing Scheduled Functions

Scheduled functions receive a context object just like API functions, but with key differences:

- `ctx.trigger` is `'cron'` (not `'http'`)
- `ctx.req` is `undefined` — there is no HTTP request
- Return values are available from the manual trigger API response, but the persistent run log stores status, timestamps, duration, and error text only

```typescript
// functions/cleanup.ts
export default async function (ctx) {
  const result = ctx.db.run(
    `DELETE FROM sessions WHERE expires_at < datetime('now')`
  );
  return { deleted: result.changes };
}
```

```typescript
// functions/sync.ts — named export
export async function run(ctx) {
  if (ctx.trigger !== 'cron') {
    return new Response('Not allowed', { status: 403 });
  }
  // ... sync logic
  return { synced: true };
}
```

## Concurrency Policies

| Policy | Behavior |
|--------|----------|
| `skip` | If the previous run is still executing, skip this trigger |
| `queue` | Queue at most one pending execution; additional triggers are skipped |
| `parallel` | Run every trigger concurrently (no limit) |

## Common Cron Expressions

| Expression | Schedule |
|------------|----------|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 * * * *` | Every hour |
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 2:00 AM |
| `0 0 * * 1` | Every Monday at midnight |
| `0 0 1 * *` | First day of every month |

## Runtime Behavior

- Schedules only execute automatically in the **Stable** environment
- They activate after `publish_app` — Draft reconcile does not start cron jobs
- Disabled schedules (`enabled: false`) are ignored
- Use `call_api` to test the function manually before publishing
- Manual trigger endpoints return the execution result inline
- Schedule runs are logged with status (`success`, `error`, `timeout`, `skipped`), start/end time, duration, and error message

## Manual Trigger Endpoints

These daemon endpoints run a configured schedule immediately and wait for completion:

| Endpoint | Runtime |
|----------|---------|
| `POST /draft/apps/:appSlug/schedule/:scheduleName/trigger` | Draft |
| `POST /stable/apps/:appSlug/schedule/:scheduleName/trigger` | Stable |

Manual triggers use the same schedule config (`function`, `concurrency`, `timeout`) as automatic runs.
