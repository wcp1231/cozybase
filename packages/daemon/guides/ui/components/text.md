# Text

Displays a text string. Supports expressions.

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
