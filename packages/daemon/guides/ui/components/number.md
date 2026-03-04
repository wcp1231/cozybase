# Number

Number input field with optional min/max/step constraints.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `number` | No | Current value |
| `min` | `number` | No | Minimum value |
| `max` | `number` | No | Maximum value |
| `step` | `number` | No | Step increment |
| `onChange` | `Action \| Action[]` | No | Action(s) triggered on value change |
<!-- AUTO-GENERATED-PROPS:END -->

## Example

```json
{ "type": "number", "min": 0, "max": 100, "step": 1 }
```

## Note

For number inputs inside a `form`, use the form's `fields` array with `"type": "number"` rather than a standalone number component. See `get_guide("ui/components/form")`.
