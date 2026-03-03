# Heading

Displays a heading (h1–h6).

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | `string` | Yes | Heading text (supports expressions) |
| `level` | `1 \| 2 \| 3 \| 4 \| 5 \| 6` | No | Heading level (default 1) |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

```json
{ "type": "heading", "text": "Dashboard", "level": 2 }
```

With expression:

```json
{ "type": "heading", "text": "Hello, ${row.name}", "level": 3 }
```
