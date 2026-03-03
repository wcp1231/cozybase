# Alert

Displays a message banner with a severity level.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | `string` | Yes | Alert text |
| `alertType` | `'info' \| 'success' \| 'warning' \| 'error'` | No | Severity: `info`, `success`, `warning`, `error` |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

```json
{ "type": "alert", "message": "Changes saved successfully.", "alertType": "success" }
```

```json
{ "type": "alert", "message": "This action cannot be undone.", "alertType": "warning" }
```

```json
{ "type": "alert", "message": "Failed to load data.", "alertType": "error" }
```
