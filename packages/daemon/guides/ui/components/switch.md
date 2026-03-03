# Switch

Toggle switch for boolean values.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | `boolean` | No | Current value |
| `onChange` | `Action/Action[]` | No | Action(s) triggered on value change |
<!-- AUTO-GENERATED-PROPS:END -->

## Example

```json
{ "type": "switch", "id": "dark-mode" }
```

Reference the switch state in other components:

```json
{
  "type": "text",
  "visible": "${dark-mode.value}",
  "text": "Dark mode is enabled"
}
```

## Note

For switches inside a `form`, use the form's `fields` array with `"type": "switch"` rather than a standalone switch component. See `get_guide("ui/components/form")`.
