# List

List component that loads data from an API and renders each item using a custom template.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `api` | ApiConfig | Yes | Data source configuration |
| `itemRender` | Component | Yes | Render template for each item (use `${row.xxx}` to access item data) |

## Example

```json
{
  "type": "list",
  "api": { "url": "/fn/_db/tables/todo" },
  "itemRender": {
    "type": "card",
    "title": "${row.title}",
    "children": [
      {
        "type": "row",
        "justify": "space-between",
        "children": [
          { "type": "tag", "text": "${row.completed === 1 ? 'Done' : 'Pending'}", "color": "${row.completed === 1 ? 'success' : 'default'}" },
          { "type": "text", "text": "${row.created_at}" }
        ]
      }
    ]
  }
}
```

The `row` scope inside `itemRender` refers to the current list item, identical to how `row` works in table columns and row actions.
