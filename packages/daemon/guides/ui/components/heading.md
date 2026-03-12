# Heading

Displays a heading (h1–h6).

`heading` ships with level-aware default typography. In most cases, setting `level` is enough; you only need extra styling for special marketing or editorial treatments.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | `string` | Yes | Heading text (supports expressions) |
| `level` | `union` | No | Heading level (default 1) |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

```json
{ "type": "heading", "text": "Dashboard", "level": 2 }
```

With expression:

```json
{ "type": "heading", "text": "Hello, ${row.name}", "level": 3 }
```

Prefer semantic levels over manual font sizing:

```json
{ "type": "heading", "text": "Section Title", "level": 4 }
```
