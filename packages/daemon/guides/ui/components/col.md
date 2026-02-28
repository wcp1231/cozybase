# Col

Vertical layout container.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | Component[] | Yes | Child components |
| `align` | string | No | Alignment: `start`, `center`, `end`, `stretch` |
| `gap` | number | No | Spacing between children (px) |

## Example

```json
{
  "type": "col",
  "gap": 16,
  "children": [
    { "type": "heading", "text": "Settings", "level": 2 },
    { "type": "text", "text": "Configure your preferences below." },
    { "type": "form", "fields": [...], "api": {...} }
  ]
}
```
