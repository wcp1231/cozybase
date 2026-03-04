# Textarea

Multi-line text input.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `string` | No | Current value |
| `placeholder` | `string` | No | Placeholder text |
| `rows` | `number` | No | Number of visible rows (default 3) |
| `onChange` | `Action \| Action[]` | No | Action(s) triggered on value change |
<!-- AUTO-GENERATED-PROPS:END -->

## Example

```json
{ "type": "textarea", "placeholder": "Enter description...", "rows": 5 }
```

## Note

For textareas inside a `form`, use the form's `fields` array with `"type": "textarea"` rather than a standalone textarea component. See `get_guide("ui/components/form")`.
