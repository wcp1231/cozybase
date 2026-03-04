# Common Component Properties

These fields are shared by all built-in components, and also by custom component instances.

## Shared Fields

<!-- AUTO-GENERATED-PROPS:START -->
| Field | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Stable component ID for cross-component references. Needed when another expression reads `${componentId.value}` / `${componentId.data}`, or when an action targets this component via `reload`. |
| `visible` | `string \| boolean` | No | Whether the component should render. Accepts a boolean or an expression like `"${form.role === 'admin'}"`. |
| `className` | `string` | No | Extra CSS class names appended to the component's root element. |
| `style` | `object` | No | Inline style object applied to the component's root element. Values may be plain strings/numbers or expressions. |
<!-- AUTO-GENERATED-PROPS:END -->

Custom component instances support one additional field:

<!-- AUTO-GENERATED-PROPS:START -->
| Field | Type | Required | Description |
|----------|------|----------|-------------|
| `props` | `object` | No | Props passed into the custom component template and exposed inside it as `${props.xxx}`. |
<!-- AUTO-GENERATED-PROPS:END -->

## `type`

Every component must declare a `type`.

Built-in component example:

```json
{ "type": "text", "text": "Hello" }
```

Custom component instance example:

```json
{ "type": "user-card", "props": { "name": "Alice" } }
```

## `id`

Use `id` when a component needs to be referenced elsewhere.

Common cases:

- Read another component's current value: `${search-input.value}`
- Read another component's loaded data: `${users-table.data}`
- Trigger a reload action: `{ "type": "reload", "target": "users-table" }`

Example:

```json
[
  { "type": "input", "id": "search-input", "placeholder": "Search..." },
  {
    "type": "table",
    "id": "users-table",
    "api": {
      "url": "/fn/_db/tables/users",
      "params": { "q": "${search-input.value}" }
    },
    "columns": [
      { "name": "name", "label": "Name" }
    ]
  }
]
```

### Which components expose `.value` or `.data`

- `.value`: stateful inputs and controls such as `form`, `input`, `textarea`, `number`, `select`, `switch`, `checkbox`, `radio`, `date-picker`, `tabs`
- `.data`: data-loading components such as `table` and `list`

Adding an `id` to purely presentational components is allowed, but it usually has no effect unless some other part of the system reads or targets that ID.

## `visible`

`visible` controls whether the component renders at all.

```json
{
  "type": "alert",
  "alertType": "warning",
  "message": "Please fill in all required fields",
  "visible": "${form.email === ''}"
}
```

Notes:

- `visible` is evaluated through the expression engine
- `false` and `"false"` both hide the component
- Prefer `visible` over toggling `style.display` when the goal is conditional rendering

## `className`

`className` appends extra CSS class names to the component's root element.

```json
{
  "type": "card",
  "className": "my-dashboard-card",
  "children": [
    { "type": "text", "text": "Revenue" }
  ]
}
```

Use `className` only when the host app provides matching CSS classes. If you need a self-contained JSON example, prefer `style`.

## `style`

`style` is a shallow inline style object applied to the component's root element.

```json
{
  "type": "card",
  "style": {
    "marginTop": 16,
    "borderColor": "var(--cz-border-strong)",
    "backgroundColor": "var(--cz-bg)"
  },
  "children": [
    { "type": "text", "text": "Styled card" }
  ]
}
```

Each style value may also contain an expression:

```json
{
  "type": "tag",
  "text": "${row.completed === 1 ? 'Done' : 'Pending'}",
  "style": {
    "fontWeight": 600,
    "opacity": "${row.completed === 1 ? 1 : 0.7}"
  }
}
```

See `get_guide("ui/styling")` for supported style patterns, limitations, and recommended usage.

## `props` for Custom Components

Only custom component instances support `props`.

Declaration:

```json
{
  "components": {
    "user-badge": {
      "props": {
        "name": { "type": "string", "required": true },
        "role": { "type": "string", "default": "member" }
      },
      "body": {
        "type": "row",
        "gap": 8,
        "children": [
          { "type": "text", "text": "${props.name}" },
          { "type": "tag", "text": "${props.role}" }
        ]
      }
    }
  }
}
```

Usage:

```json
{ "type": "user-badge", "props": { "name": "Alice", "role": "admin" } }
```
