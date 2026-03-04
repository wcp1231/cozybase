# Card

Card container with optional title.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | No | Card title |
| `children` | `Component \| Component[]` | Yes | Child components |
| `padding` | `number` | No | Inner padding (px) |
| `action` | `Action \| Action[]` | No | Optional click action. When provided, the whole card becomes clickable. |
<!-- AUTO-GENERATED-PROPS:END -->

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

Clickable card:

```json
{
  "type": "card",
  "title": "Open details",
  "action": {
    "type": "link",
    "url": "/details"
  },
  "children": [
    { "type": "text", "text": "Click anywhere in this card" }
  ]
}
```
