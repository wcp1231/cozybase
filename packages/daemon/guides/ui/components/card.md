# Card

Card container with optional title.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | No | Card title |
| `children` | Component[] | Yes | Child components |
| `padding` | number | No | Inner padding (px) |

## Example

```json
{
  "type": "card",
  "title": "Recent Activity",
  "padding": 16,
  "children": [
    { "type": "table", "id": "activity-table", "api": { "url": "/fn/_db/tables/activity" }, "columns": [...] }
  ]
}
```
