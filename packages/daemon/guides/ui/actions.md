# Actions

Actions are the interaction mechanism for UI components, used to respond to user operations (button clicks, form submissions, etc.).

## Action Types

### api — Send HTTP Request

```json
{
  "type": "api",
  "method": "POST",
  "url": "/fn/_db/tables/todo",
  "body": { "title": "${form.title}", "completed": 0 },
  "onSuccess": [
    { "type": "reload", "target": "todo-table" },
    { "type": "close" }
  ],
  "onError": [
    { "type": "dialog", "title": "Error", "body": { "type": "text", "text": "Failed" } }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `method` | string | HTTP method (GET, POST, PATCH, DELETE, etc.) |
| `url` | string | API path (APP-relative path, supports expressions) |
| `body` | object | Request body (supports expressions) |
| `onSuccess` | Action[] | Action chain to execute after successful request |
| `onError` | Action[] | Action chain to execute after failed request |

URLs use APP-relative paths (e.g. `/fn/_db/tables/todo`); the system automatically resolves them to full URLs.

In `onSuccess` callbacks, response data is accessible via `${response.xxx}`.

### reload — Reload Component

```json
{
  "type": "reload",
  "target": "todo-table"
}
```

| Property | Type | Description |
|----------|------|-------------|
| `target` | string | ID of the component to reload |

Commonly used in api action's `onSuccess` to refresh data lists.

### dialog — Open Dialog

```json
{
  "type": "dialog",
  "title": "New Todo",
  "body": {
    "type": "form",
    "fields": [
      { "name": "title", "label": "Title", "type": "input", "required": true }
    ],
    "api": { "method": "POST", "url": "/fn/_db/tables/todo" },
    "onSuccess": [
      { "type": "reload", "target": "todo-table" },
      { "type": "close" }
    ]
  }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Dialog title (supports expressions) |
| `body` | Component | Dialog content (any component) |

### link — Page Navigation

```json
{
  "type": "link",
  "url": "/settings"
}
```

| Property | Type | Description |
|----------|------|-------------|
| `url` | string | Target URL (APP-relative path, supports expressions) |

Link URLs use the same APP-relative path resolution as API URLs. For example, `/settings` resolves to `/{mode}/apps/{appName}/settings`. External URLs (`https://...`) are passed through as-is.

### close — Close Dialog

```json
{
  "type": "close"
}
```

Closes the currently open dialog.

### confirm — Confirmation Dialog

```json
{
  "type": "confirm",
  "message": "Are you sure?",
  "onConfirm": {
    "type": "api",
    "method": "DELETE",
    "url": "/fn/_db/tables/todo/${row.id}"
  },
  "onCancel": []
}
```

| Property | Type | Description |
|----------|------|-------------|
| `message` | string | Confirmation prompt text |
| `onConfirm` | Action/Action[] | Executed when user confirms |
| `onCancel` | Action/Action[] | Executed when user cancels |

## Action Chains

Actions can be arrays, executed in order:

```json
"onSuccess": [
  { "type": "reload", "target": "todo-table" },
  { "type": "close" }
]
```

Or a single Action:

```json
"action": { "type": "link", "url": "/home" }
```

## Quick Confirm

Table `rowActions` support a `confirm` shorthand property:

```json
{
  "label": "Delete",
  "confirm": "Are you sure you want to delete this item?",
  "action": {
    "type": "api",
    "method": "DELETE",
    "url": "/fn/_db/tables/todo/${row.id}",
    "onSuccess": [{ "type": "reload", "target": "todo-table" }]
  }
}
```

When `confirm` is set, clicking first shows a confirmation dialog; the `action` is executed only after the user confirms.
