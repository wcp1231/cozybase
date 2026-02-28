# Select

Dropdown selector with single or multi-select support.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | string/string[] | No | Current value |
| `options` | OptionItem[] | Yes | `{ label, value }` array |
| `multiple` | boolean | No | Enable multi-select |
| `placeholder` | string | No | Placeholder text |
| `onChange` | Action[] | No | Action(s) triggered on value change |

## Examples

Single select:

```json
{
  "type": "select",
  "id": "role-filter",
  "placeholder": "Filter by role...",
  "options": [
    { "label": "Admin", "value": "admin" },
    { "label": "User", "value": "user" },
    { "label": "Guest", "value": "guest" }
  ]
}
```

Multi-select:

```json
{
  "type": "select",
  "multiple": true,
  "options": [
    { "label": "Email", "value": "email" },
    { "label": "SMS", "value": "sms" },
    { "label": "Push", "value": "push" }
  ]
}
```

## Note

For selects inside a `form`, use the form's `fields` array with `"type": "select"` rather than a standalone select component. See `get_guide("ui/components/form")`.
