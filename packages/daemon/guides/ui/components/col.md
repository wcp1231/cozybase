# Col

Vertical layout container.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `children` | `Component \| Component[]` | Yes | Child components |
| `align` | `start \| center \| end \| stretch` | No | Alignment: `start`, `center`, `end`, `stretch` |
| `gap` | `number` | No | Spacing between children (px) |
<!-- AUTO-GENERATED-PROPS:END -->

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
