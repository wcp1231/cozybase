# Input

Text input field.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `value` | string | No | Current value |
| `placeholder` | string | No | Placeholder text |
| `onChange` | Action[] | No | Action(s) triggered on value change |

## Examples

```json
{ "type": "input", "placeholder": "Enter your name..." }
```

With id for referencing in expressions:

```json
{
  "type": "input",
  "id": "search-input",
  "placeholder": "Search..."
}
```

Other components can reference the value via `${search-input.value}`.

## Note

For text inputs inside a `form`, use the form's `fields` array with `"type": "input"` rather than a standalone input component. See `get_guide("ui/components/form")`.
