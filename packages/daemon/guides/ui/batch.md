# ui_batch — Batch UI Operations

`ui_batch` executes multiple page and component operations on `ui/pages.json` in a single call.

## Operations

### get

Read a component node by ID.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | string | yes | ID of the node to read |

### insert

Insert a new component node under a parent.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `parent_id` | string | yes | ID of the parent container (or a `$ref`) |
| `node` | object | yes | Component definition (must include `type`; any provided `id` is ignored because the system always generates one) |
| `index` | number | no | Position among siblings (0-based); appends if omitted |

### update

Update properties of an existing node.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | string | yes | ID of the node to update (or a `$ref`) |
| `props` | object | yes | Properties to merge into the node |

**Cannot update `id` or `type`** — use delete + insert instead.

### delete

Remove a node and its entire subtree.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | string | yes | ID of the node to delete (or a `$ref`) |

### move

Move a node to a different parent or position.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `node_id` | string | yes | ID of the node to move (or a `$ref`) |
| `new_parent_id` | string | yes | Target parent container ID (or a `$ref`) |
| `index` | number | no | Position in the new parent; appends if omitted |

### page_add

Add a new page.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Page ID (becomes the URL route segment, e.g. `user-list`) |
| `title` | string | yes | Display title |
| `index` | number | no | Position in page list; appends if omitted |

### page_remove

Remove a page and all its components.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page_id` | string | yes | ID of the page to remove |

### page_update

Rename a page.

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `page_id` | string | yes | ID of the page to update |
| `title` | string | yes | New title |

## Ref System

Every operation accepts an optional `ref` field (must start with `$`). The ref binds the resulting node ID so later operations can reference it.

- **Insert**: `ref` binds the auto-generated node ID
- **page_add**: `ref` binds the page ID (same as the `id` you provided)
- **get/update/delete/move**: `ref` binds the `node_id`

Refs are only resolved in operation-level fields such as `parent_id`, `node_id`, `new_parent_id`, and `page_id`.
Refs are **not** interpolated inside nested JSON like `node.action.target`, `node.api.params`, or `props`.
If a new component's generated ID must be referenced from component JSON, do it in two passes:
- First call: create the node and capture its returned `node_id`
- Second call: update the dependent component with the real ID

When an operation **fails**, any later operation that references its `$ref` is automatically **skipped** (status `skipped`). Unrelated operations continue normally.

## Response Format

```json
{
  "committed": true,
  "results": [
    { "status": "ok", "node_id": "text-a1b2c" },
    { "status": "ok", "node_id": "row-x9y8z" },
    { "status": "error", "error": { "code": "NOT_FOUND", "message": "..." } },
    { "status": "skipped", "skipped_reason": "Dependency $container failed" }
  ]
}
```

- `committed`: `true` if at least one write operation succeeded; `false` for pure-get batches or when all writes fail
- `status`: `ok` | `error` | `skipped`

## Examples

### Create a page with components

```
ui_batch(app_name: "my-app", operations: [
  { op: "page_add", ref: "$page", id: "user-list", title: "User List" },
  { op: "insert", ref: "$header", parent_id: "$page", node: { type: "row", justify: "between", align: "center" } },
  { op: "insert", parent_id: "$header", node: { type: "heading", level: 2, text: "Users" } },
  { op: "insert", parent_id: "$header", node: { type: "button", label: "Create User", action: { type: "link", url: "/users/new" } } },
  { op: "insert", parent_id: "$page", node: { type: "table", api: { url: "/fn/_db/tables/users", method: "GET" }, columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Name" },
    { name: "email", label: "Email" }
  ] } }
])
```

### Build nested structure with refs

```
ui_batch(app_name: "my-app", operations: [
  { op: "insert", ref: "$card", parent_id: "dashboard", node: { type: "card", title: "Stats" } },
  { op: "insert", ref: "$row", parent_id: "$card", node: { type: "row", gap: 4 } },
  { op: "insert", parent_id: "$row", node: { type: "stat", label: "Total Users", value: "${stats.total}" } },
  { op: "insert", parent_id: "$row", node: { type: "stat", label: "Active Users", value: "${stats.active}" } }
])
```

### Batch update multiple components

```
ui_batch(app_name: "my-app", operations: [
  { op: "update", node_id: "heading-abc", props: { text: "Updated Title" } },
  { op: "update", node_id: "tbl-users", props: { columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email Address" }
  ] } }
])
```

### Replace a component (delete + insert)

```
ui_batch(app_name: "my-app", operations: [
  { op: "delete", node_id: "old-text-id" },
  { op: "insert", parent_id: "row-actions", node: { type: "heading", level: 3, text: "New Heading" } }
])
```

### Two-pass update when another component must reference a new ID

First call:

```
ui_batch(app_name: "my-app", operations: [
  { op: "insert", ref: "$table", parent_id: "user-list", node: { type: "table", api: { url: "/fn/_db/tables/users", method: "GET" }, columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Name" }
  ] } }
])
```

Then read the returned `results[0].node_id` and use it in a follow-up call:

```
ui_batch(app_name: "my-app", operations: [
  { op: "update", node_id: "btn-refresh", props: { action: { type: "reload", target: "table-ab123" } } }
])
```

### Read-only batch (multiple gets)

```
ui_batch(app_name: "my-app", operations: [
  { op: "get", node_id: "tbl-users" },
  { op: "get", node_id: "heading-abc" }
])
```

Returns `committed: false` (no writes performed). Each result contains the full node data.

### Partial failure and cascade skip

```
ui_batch(app_name: "my-app", operations: [
  { op: "insert", ref: "$container", parent_id: "missing-parent", node: { type: "row" } },
  { op: "insert", parent_id: "$container", node: { type: "text", text: "Child" } },
  { op: "update", node_id: "txt-title", props: { text: "Independent" } }
])
```

Result:
- Operation 0: `error` (parent not found)
- Operation 1: `skipped` (depends on failed `$container`)
- Operation 2: `ok` (independent, runs normally)

## Limitations

- Cannot modify `id` or `type` via update — use delete + insert to change a node's type
- Insert always generates a fresh component ID and ignores any caller-provided `id`
- Insert and move only work with container types: `page`, `row`, `col`, `card`, `dialog`
- `ref` must start with `$` (e.g. `$myRef`, `$row1`)
