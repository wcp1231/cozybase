# Styling

JSON-to-UI provides two generic styling hooks on every component:

- `style`: inline style object
- `className`: extra CSS classes on the component root

For most generated UI, prefer schema-level props first (`gap`, `padding`, `variant`, `color`, `width`, etc.), then use `style` for one-off adjustments.

## `style` Object Contract

`style` is passed to the rendered component root as a React inline style object.

This means:

- Style keys use camelCase: `backgroundColor`, `fontSize`, `justifyContent`
- Style values must resolve to string or number
- Numeric values work well for pixel-based properties such as `marginTop: 12`
- String values are needed for `%`, `rem`, `calc(...)`, CSS variables, and colors
- Each style value may contain an expression such as `"${row.done === 1 ? 1 : 0.6}"`

Example:

```json
{
  "type": "row",
  "justify": "space-between",
  "style": {
    "padding": 16,
    "backgroundColor": "var(--cz-bg-muted)",
    "borderRadius": "var(--cz-radius-md)"
  },
  "children": [
    { "type": "text", "text": "Left" },
    { "type": "text", "text": "Right" }
  ]
}
```

## Commonly Useful Style Fields

These are not special Cozybase fields. They are regular inline CSS properties that work well with the current renderer:

### Layout and Spacing

- `display`
- `width`, `height`, `minWidth`, `maxWidth`, `minHeight`, `maxHeight`
- `margin`, `marginTop`, `marginBottom`, `marginLeft`, `marginRight`
- `padding`, `paddingTop`, `paddingBottom`, `paddingLeft`, `paddingRight`
- `gap`
- `flex`, `flexDirection`, `flexWrap`
- `justifyContent`, `alignItems`, `alignSelf`

### Typography

- `color`
- `fontSize`
- `fontWeight`
- `lineHeight`
- `letterSpacing`
- `textAlign`
- `whiteSpace`

### Visual Style

- `background`, `backgroundColor`
- `border`, `borderColor`, `borderWidth`, `borderStyle`
- `borderRadius`
- `boxShadow`
- `opacity`
- `cursor`

### Overflow and Scrolling

- `overflow`, `overflowX`, `overflowY`

## Expressions Inside Styles

Style values can be dynamic:

```json
{
  "type": "stat",
  "label": "Completion",
  "value": "${row.progress}",
  "style": {
    "borderColor": "${row.progress >= 80 ? 'var(--cz-success-border)' : 'var(--cz-border)'}",
    "backgroundColor": "${row.progress >= 80 ? 'var(--cz-success-bg)' : 'var(--cz-bg)'}"
  }
}
```

## Supported CSS Variable Tokens

The built-in theme exposes CSS variables that work well in `style`, for example:

- `var(--cz-primary)`
- `var(--cz-danger)`
- `var(--cz-text)`
- `var(--cz-text-secondary)`
- `var(--cz-bg)`
- `var(--cz-bg-muted)`
- `var(--cz-border)`
- `var(--cz-border-strong)`
- `var(--cz-success-bg)`, `var(--cz-success-text)`
- `var(--cz-warning-bg)`, `var(--cz-warning-text)`
- `var(--cz-error-bg)`, `var(--cz-error-text)`
- `var(--cz-info-bg)`, `var(--cz-info-text)`
- `var(--cz-radius-sm)`, `var(--cz-radius-md)`, `var(--cz-radius-full)`
- `var(--cz-shadow-sm)`, `var(--cz-shadow-md)`

Example:

```json
{
  "type": "button",
  "label": "Custom CTA",
  "action": { "type": "link", "url": "/settings" },
  "style": {
    "backgroundColor": "var(--cz-primary)",
    "borderRadius": "var(--cz-radius-full)",
    "boxShadow": "var(--cz-shadow-sm)"
  }
}
```

## `className`

`className` appends CSS classes to the component root element.

```json
{
  "type": "text",
  "text": "External CSS example",
  "className": "marketing-caption"
}
```

Use `className` when:

- the host app already ships CSS classes you want to reuse
- you want to keep style decisions outside JSON

Prefer `style` when you need the JSON alone to be self-describing.

## Limits and Caveats

Current JSON-to-UI styling is intentionally simple:

- `style` is shallow only; nested objects are not supported
- No pseudo-classes such as `:hover` or `:focus` inside `style`
- No media queries or breakpoint-specific syntax inside `style`
- No CSS selectors inside JSON
- `style` only affects the component root element, not every internal sub-element

Examples of what this means:

- Styling a `card` root works, but it will not directly restyle the internal title wrapper unless that component exposes a dedicated prop
- Styling a `table` root affects the table container, not individual cells; for per-cell styling, use column `render`
- For show/hide logic, prefer `visible` instead of manually setting `display: 'none'`

## Recommended Usage Order

When choosing how to control appearance:

1. Use component-specific props first, such as `gap`, `padding`, `variant`, `color`, `width`, `alertType`
2. Use `style` for root-level visual tweaks that are not covered by schema props
3. Use `className` only when you control external CSS and want that coupling
