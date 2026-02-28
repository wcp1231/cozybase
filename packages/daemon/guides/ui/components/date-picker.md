# Date Picker

Date selection input with calendar popup.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | string | No | Current value (date string) |
| `format` | string | No | Date format |
| `onChange` | Action[] | No | Action(s) triggered on value change |

## Example

```json
{ "type": "date-picker", "format": "YYYY-MM-DD" }
```

## Note

For date pickers inside a `form`, use the form's `fields` array with `"type": "date-picker"` rather than a standalone date-picker component. See `get_guide("ui/components/form")`.
