# Page

Container component that wraps content with an optional title.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | No | Page title |
| `children` | Component[] | Yes | Child components |

## Example

```json
{
  "type": "page",
  "title": "Dashboard",
  "children": [
    { "type": "heading", "text": "Overview", "level": 2 },
    { "type": "table", "id": "data-table", "api": { "url": "/fn/_db/tables/items" }, "columns": [...] }
  ]
}
```
