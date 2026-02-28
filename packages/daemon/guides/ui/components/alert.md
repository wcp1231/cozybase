# Alert

Displays a message banner with a severity level.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `message` | string | Yes | Alert text |
| `alertType` | string | No | Severity: `info`, `success`, `warning`, `error` |

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
