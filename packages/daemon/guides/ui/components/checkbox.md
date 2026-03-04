# Checkbox

Checkbox for a single boolean value or a multi-select group.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `union` | No | Current value |
| `label` | `string` | No | Label for single checkbox |
| `options` | `Option[][]` | No | Options for multi-select group |
| `onChange` | `Action \| Action[]` | No | Action(s) triggered on value change |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

Single checkbox:

```json
{ "type": "checkbox", "label": "I agree to the terms" }
```

Multi-select group:

```json
{
  "type": "checkbox",
  "options": [
    { "label": "Email", "value": "email" },
    { "label": "SMS", "value": "sms" },
    { "label": "Push notifications", "value": "push" }
  ]
}
```

When `options` is provided, the value is a `string[]` of selected option values. Without `options`, the value is a `boolean`.

## Note

For checkboxes inside a `form`, use the form's `fields` array with `"type": "checkbox"` rather than a standalone checkbox component. See `get_guide("ui/components/form")`.
