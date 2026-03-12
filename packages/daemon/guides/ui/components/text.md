# Text

Displays a text string. Supports expressions.

By default, `text` renders with the built-in typography baseline for body copy. Only add `style` when you need to override the default text tone, size, or spacing.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | `string` | Yes | Text content (supports expressions) |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

Static text:

```json
{ "type": "text", "text": "Hello World" }
```

With expression:

```json
{ "type": "text", "text": "Welcome, ${row.name}" }
```

Conditional visibility:

```json
{
  "type": "text",
  "text": "This item is overdue.",
  "visible": "${row.status === 'overdue'}"
}
```

Override the default typography only when needed:

```json
{
  "type": "text",
  "text": "Quiet secondary note",
  "style": {
    "fontSize": 12,
    "color": "var(--cz-text-muted)"
  }
}
```
