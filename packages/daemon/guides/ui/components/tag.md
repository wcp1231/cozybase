# Tag

Tag / badge for displaying status labels or categories.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | string | Yes | Tag text (supports expressions) |
| `color` | string | No | Color: `default`, `success`, `warning`, `error`, `info`, or any custom color value |

## Examples

Static tag:

```json
{ "type": "tag", "text": "Active", "color": "success" }
```

Dynamic status tag:

```json
{
  "type": "tag",
  "text": "${row.completed === 1 ? 'Completed' : 'Pending'}",
  "color": "${row.completed === 1 ? 'success' : 'default'}"
}
```
