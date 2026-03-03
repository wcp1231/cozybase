# Row

Horizontal layout container.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | `Component[]` | Yes | Child components |
| `justify` | `'start' \| 'end' \| 'center' \| 'space-between' \| 'space-around'` | No | Horizontal alignment: `start`, `end`, `center`, `space-between`, `space-around` |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | No | Vertical alignment: `start`, `center`, `end`, `stretch` |
| `gap` | `number` | No | Spacing between children (px) |
| `wrap` | `boolean` | No | Whether to wrap children to next line |
<!-- AUTO-GENERATED-PROPS:END -->

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
