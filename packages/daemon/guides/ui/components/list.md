# List

List component that loads data from an API and renders each item using a custom template.

## API Response Format

Same as the Table component — the API must return `{ "data": [...] }`. If the response is a plain array or uses a different key, the list will display no data. The built-in CRUD API returns this format automatically. For custom functions, wrap query results: `return { data: rows }`.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `api` | `ApiConfig` | Yes | Data source configuration |
| `itemRender` | `Component` | Yes | Render template for each item (use `${row.xxx}` to access item data) |
<!-- AUTO-GENERATED-PROPS:END -->

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
