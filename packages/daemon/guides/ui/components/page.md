# Page

Vertical container component for grouping child content.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | No | Optional metadata field. The current renderer does not display it automatically. |
| `children` | `Component[]` | Yes | Child components |
<!-- AUTO-GENERATED-PROPS:END -->

## Example

```json
{
  "type": "page",
  "children": [
    { "type": "heading", "text": "Overview", "level": 2 },
    { "type": "table", "id": "data-table", "api": { "url": "/fn/_db/tables/items" }, "columns": [...] }
  ]
}
```
