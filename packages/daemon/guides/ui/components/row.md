# Row

Horizontal layout container.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | Component[] | Yes | Child components |
| `justify` | string | No | Horizontal alignment: `start`, `end`, `center`, `space-between`, `space-around` |
| `align` | string | No | Vertical alignment: `start`, `center`, `end`, `stretch` |
| `gap` | number | No | Spacing between children (px) |
| `wrap` | boolean | No | Whether to wrap children to next line |

## Examples

```json
{
  "type": "row",
  "justify": "space-between",
  "align": "center",
  "children": [
    { "type": "heading", "text": "Users", "level": 2 },
    { "type": "button", "label": "Add User", "variant": "primary", "action": {...} }
  ]
}
```

Toolbar with gap and wrapping:

```json
{
  "type": "row",
  "gap": 8,
  "wrap": true,
  "children": [
    { "type": "button", "label": "Export", "variant": "secondary", "action": {...} },
    { "type": "button", "label": "Import", "variant": "secondary", "action": {...} }
  ]
}
```
