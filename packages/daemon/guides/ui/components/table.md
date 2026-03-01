# Table Component

Data table that loads data from an API and displays it in tabular form, supporting custom column rendering, row actions, and pagination.

## API Response Format

The Table component expects the API to return a JSON object with a `data` array:

```json
{
  "data": [
    { "id": 1, "title": "Task A", "created_at": "2024-01-01" },
    { "id": 2, "title": "Task B", "created_at": "2024-01-02" }
  ]
}
```

The built-in CRUD API (`/fn/_db/tables/{table}`) returns this format automatically. When using a custom function as data source, you **must** wrap the query result in `{ data: rows }`:

```typescript
// functions/tasks-with-details.ts → GET /fn/tasks-with-details
export function GET(ctx) {
  const rows = ctx.db.query(`
    SELECT t.*, u.name as assignee_name
    FROM tasks t
    LEFT JOIN users u ON t.assignee_id = u.id
    ORDER BY t.created_at DESC
  `);
  return { data: rows };
}
```

> **If the API returns a plain array or any other structure without a `data` array, the table will display no data.**

## Basic Usage

```json
{
  "type": "table",
  "id": "todo-table",
  "api": {
    "url": "/fn/_db/tables/todo",
    "params": {
      "order": "created_at.desc"
    }
  },
  "columns": [
    { "name": "title", "label": "Title" },
    { "name": "created_at", "label": "Created At" }
  ]
}
```

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `api` | ApiConfig | Yes | Data source configuration |
| `columns` | ColumnSchema[] | Yes | Column definitions |
| `rowActions` | RowActionSchema[] | No | Row action buttons |
| `pagination` | boolean | No | Enable pagination |
| `pageSize` | number | No | Rows per page |

## Column Definition (ColumnSchema)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Data source field name |
| `label` | string | Yes | Column header |
| `render` | Component | No | Custom render component |
| `width` | number/string | No | Column width |

### Custom Column Rendering

Use the `render` property to render column values as other components. Access current row data via `${row.xxx}`:

```json
{
  "name": "status",
  "label": "Status",
  "render": {
    "type": "tag",
    "text": "${row.completed === 1 ? 'Completed' : 'Pending'}",
    "color": "${row.completed === 1 ? 'success' : 'default'}"
  }
}
```

## Row Actions (RowActionSchema)

Display action buttons at the end of each row:

```json
"rowActions": [
  {
    "label": "${row.completed === 1 ? 'Mark Pending' : 'Mark Completed'}",
    "action": {
      "type": "api",
      "method": "PATCH",
      "url": "/fn/_db/tables/todo/${row.id}",
      "body": { "completed": "${row.completed === 1 ? 0 : 1}" },
      "onSuccess": [{ "type": "reload", "target": "todo-table" }]
    }
  },
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
]
```

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Button text (supports expressions) |
| `action` | Action/Action[] | Action(s) triggered on click |
| `confirm` | string | Confirmation prompt text (shows confirmation dialog before executing action) |

## Dynamic Filtering

Implement dynamic filtering by combining `api.params` with other components:

```json
[
  {
    "type": "tabs",
    "id": "status-tabs",
    "items": [
      { "label": "All", "value": "" },
      { "label": "Pending", "value": "0" },
      { "label": "Completed", "value": "1" }
    ]
  },
  {
    "type": "table",
    "id": "todo-table",
    "api": {
      "url": "/fn/_db/tables/todo",
      "params": {
        "completed": "${status-tabs.value}",
        "order": "created_at.desc"
      }
    },
    "columns": [...]
  }
]
```

When the tabs selected value changes, the table automatically reloads its data.

## Full Example

```json
{
  "type": "table",
  "id": "todo-table",
  "api": {
    "url": "/fn/_db/tables/todo",
    "params": {
      "completed": "${status-tabs.value}",
      "order": "created_at.desc"
    }
  },
  "columns": [
    { "name": "title", "label": "Title" },
    {
      "name": "completed",
      "label": "Status",
      "render": {
        "type": "tag",
        "text": "${row.completed === 1 ? 'Completed' : 'Pending'}",
        "color": "${row.completed === 1 ? 'success' : 'default'}"
      }
    },
    { "name": "created_at", "label": "Created At" }
  ],
  "rowActions": [
    {
      "label": "${row.completed === 1 ? 'Mark Pending' : 'Mark Completed'}",
      "action": {
        "type": "api",
        "method": "PATCH",
        "url": "/fn/_db/tables/todo/${row.id}",
        "body": { "completed": "${row.completed === 1 ? 0 : 1}" },
        "onSuccess": [{ "type": "reload", "target": "todo-table" }]
      }
    },
    {
      "label": "Delete",
      "confirm": "Are you sure you want to delete this todo?",
      "action": {
        "type": "api",
        "method": "DELETE",
        "url": "/fn/_db/tables/todo/${row.id}",
        "onSuccess": [{ "type": "reload", "target": "todo-table" }]
      }
    }
  ]
}
```
