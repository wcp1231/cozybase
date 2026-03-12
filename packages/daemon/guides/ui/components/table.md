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

If the API also returns pagination metadata, the table uses it to decide whether the top pagination toolbar should be shown:

```json
{
  "data": [
    { "id": 1, "title": "Task A", "created_at": "2024-01-01" }
  ],
  "meta": {
    "total": 12,
    "limit": 10,
    "offset": 0
  }
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
>
> When `meta.total` is available, the table only shows pagination controls if `total > pageSize`. Smaller result sets render directly without pagination controls.

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

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `api` | `ApiConfig` | Yes | Data source configuration |
| `columns` | `Column[][]` | Yes | Column definitions |
| `rowActions` | `RowAction[][]` | No | Row action buttons |
| `pagination` | `boolean` | No | Enable pagination. When enabled, controls appear in the table top toolbar only if the result exceeds `pageSize`. |
| `pageSize` | `number` | No | Rows per page |
<!-- AUTO-GENERATED-PROPS:END -->

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

The same row-scoped expressions also work inside interactive render components such as `link`:

```json
{
  "name": "title",
  "label": "Title",
  "render": {
    "type": "link",
    "text": "${row.title}",
    "action": {
      "type": "link",
      "url": "/todo-list/detail?id=${row.id}"
    }
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

## Toolbar Layout

When you place action buttons above a table, prefer wrapping the toolbar row and the table in a `col` so the spacing stays explicit and easy to tune:

```json
{
  "type": "col",
  "gap": 12,
  "children": [
    {
      "type": "row",
      "justify": "space-between",
      "children": [
        { "type": "button", "label": "刷新", "action": { "type": "reload", "target": "todo-table" } },
        { "type": "button", "label": "仅看待办", "action": { "type": "close" } }
      ]
    },
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
        { "name": "title", "label": "Title" }
      ]
    }
  ]
}
```

The renderer also applies a small default vertical gap between top-level body siblings, so plain `[row, table]` layouts no longer appear visually glued together. Use a `col` when you want tighter control over the spacing.

## External Sorting

Sorting should continue to be driven by external controls that update `api.params.order`, instead of relying on built-in clickable table headers.

```json
[
  {
    "type": "tabs",
    "id": "sort-tabs",
    "items": [
      { "label": "最新创建", "value": "created_at.desc" },
      { "label": "最早创建", "value": "created_at.asc" },
      { "label": "标题 A-Z", "value": "title.asc" }
    ]
  },
  {
    "type": "table",
    "id": "todo-table",
    "api": {
      "url": "/fn/_db/tables/todo",
      "params": {
        "order": "${sort-tabs.value}"
      }
    },
    "columns": [
      { "name": "title", "label": "Title" },
      { "name": "created_at", "label": "Created At" }
    ]
  }
]
```

The built-in CRUD query layer supports both:

- `where` for filtering
- `order` for sorting

For more advanced behavior, combine `tabs`, `form`, `button`, and `reload` actions rather than expanding Table into a full data-grid component.

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
