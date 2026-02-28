# Radio

Radio button group for single-value selection.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | string | No | Current selected value |
| `options` | OptionItem[] | Yes | `{ label, value }` array |
| `onChange` | Action[] | No | Action(s) triggered on value change |

## Example

```json
{
  "type": "radio",
  "options": [
    { "label": "Male", "value": "male" },
    { "label": "Female", "value": "female" },
    { "label": "Other", "value": "other" }
  ]
}
```

## Note

For radio groups inside a `form`, use the form's `fields` array with `"type": "radio"` rather than a standalone radio component. See `get_guide("ui/components/form")`.
