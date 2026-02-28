# Components

Quick reference for 26 built-in UI components. Each component uses the `type` field to specify its type. All components share the base properties `id`, `visible`, `className`, and `style`.

## Layout Components

### page

Container component with a title and child components.

```json
{ "type": "page", "title": "My Page", "children": [...] }
```

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Page title |
| `children` | Component[] | Child components |

### row

Horizontal layout.

```json
{ "type": "row", "justify": "space-between", "align": "center", "gap": 16, "children": [...] }
```

| Property | Type | Description |
|----------|------|-------------|
| `children` | Component[] | Child components |
| `justify` | string | Horizontal alignment: `start`, `end`, `center`, `space-between`, `space-around` |
| `align` | string | Vertical alignment: `start`, `center`, `end`, `stretch` |
| `gap` | number | Spacing (px) |
| `wrap` | boolean | Whether to wrap |

### col

Vertical layout.

```json
{ "type": "col", "gap": 8, "children": [...] }
```

| Property | Type | Description |
|----------|------|-------------|
| `children` | Component[] | Child components |
| `align` | string | Alignment: `start`, `center`, `end`, `stretch` |
| `gap` | number | Spacing (px) |

### card

Card container with optional title.

```json
{ "type": "card", "title": "Summary", "padding": 16, "children": [...] }
```

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Card title |
| `children` | Component[] | Child components |
| `padding` | number | Inner padding (px) |

### tabs

Tab switcher. Can be used for data filtering (reference selected value via `${tabs-id.value}`) or content grouping (via `body`).

```json
{
  "type": "tabs",
  "id": "status-tabs",
  "items": [
    { "label": "All", "value": "" },
    { "label": "Active", "value": "active" },
    { "label": "Settings", "value": "settings", "body": [...] }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `items` | TabItem[] | Tab items |
| `defaultValue` | string | Default selected value |

TabItem: `{ label, value, body? }`. `body` is optional; when present, it displays the tab's content.

### divider

Separator line.

```json
{ "type": "divider", "label": "Section" }
```

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Text on the divider |

## Data Display Components

### table

Data table that loads data from an API. See `get_guide("ui/components/table")` for details.

```json
{
  "type": "table",
  "id": "todo-table",
  "api": { "url": "/fn/_db/tables/todo", "params": { "order": "created_at.desc" } },
  "columns": [
    { "name": "title", "label": "Title" },
    { "name": "status", "label": "Status", "render": { "type": "tag", "text": "${row.status}" } }
  ],
  "rowActions": [
    { "label": "Edit", "action": { "type": "dialog", "title": "Edit", "body": {...} } }
  ]
}
```

### list

List component that loads data from an API with custom item rendering.

```json
{
  "type": "list",
  "api": { "url": "/fn/_db/tables/todo" },
  "itemRender": { "type": "card", "title": "${row.title}", "children": [...] }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `api` | ApiConfig | Data source |
| `itemRender` | Component | Render template for each item (use `${row.xxx}`) |

### text

Text display.

```json
{ "type": "text", "text": "Hello World" }
```

| Property | Type | Description |
|----------|------|-------------|
| `text` | string | Text content (supports expressions) |

### heading

Heading.

```json
{ "type": "heading", "text": "Dashboard", "level": 2 }
```

| Property | Type | Description |
|----------|------|-------------|
| `text` | string | Heading text (supports expressions) |
| `level` | 1-6 | Heading level (default 1) |

### tag

Tag / badge.

```json
{ "type": "tag", "text": "Active", "color": "success" }
```

| Property | Type | Description |
|----------|------|-------------|
| `text` | string | Tag text (supports expressions) |
| `color` | string | Color: `default`, `success`, `warning`, `error`, `info`, or custom color |

### stat

Statistical value display.

```json
{ "type": "stat", "label": "Total Sales", "value": "${response.total}", "prefix": "$" }
```

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Metric name |
| `value` | string/number | Value (supports expressions) |
| `prefix` | string | Prefix (e.g. $) |
| `suffix` | string | Suffix (e.g. %) |

## Data Input Components

### form

Form component. See `get_guide("ui/components/form")` for details.

```json
{
  "type": "form",
  "fields": [
    { "name": "title", "label": "Title", "type": "input", "required": true },
    { "name": "priority", "label": "Priority", "type": "select", "options": [
      { "label": "High", "value": "high" },
      { "label": "Low", "value": "low" }
    ]}
  ],
  "api": { "method": "POST", "url": "/fn/_db/tables/todo" },
  "onSuccess": [{ "type": "reload", "target": "table-1" }, { "type": "close" }]
}
```

### input

Text input field.

```json
{ "type": "input", "placeholder": "Enter text..." }
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | string | Current value |
| `placeholder` | string | Placeholder text |
| `onChange` | Action[] | Triggered on value change |

### textarea

Multi-line text input.

```json
{ "type": "textarea", "placeholder": "Enter description...", "rows": 4 }
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | string | Current value |
| `placeholder` | string | Placeholder text |
| `rows` | number | Number of visible rows |
| `onChange` | Action[] | Triggered on value change |

### number

Number input.

```json
{ "type": "number", "min": 0, "max": 100, "step": 1 }
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | number | Current value |
| `min` | number | Minimum value |
| `max` | number | Maximum value |
| `step` | number | Step increment |
| `onChange` | Action[] | Triggered on value change |

### select

Dropdown selector.

```json
{
  "type": "select",
  "placeholder": "Choose...",
  "options": [
    { "label": "Option A", "value": "a" },
    { "label": "Option B", "value": "b" }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | string/string[] | Current value |
| `options` | OptionItem[] | `{ label, value }` array |
| `multiple` | boolean | Enable multi-select |
| `placeholder` | string | Placeholder text |
| `onChange` | Action[] | Triggered on value change |

### switch

Toggle switch.

```json
{ "type": "switch", "id": "dark-mode" }
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | boolean | Current value |
| `onChange` | Action[] | Triggered on value change |

### checkbox

Checkbox. Single or multi-select group.

```json
{ "type": "checkbox", "label": "I agree to the terms" }
```

Multi-select group:
```json
{
  "type": "checkbox",
  "options": [
    { "label": "Email", "value": "email" },
    { "label": "SMS", "value": "sms" }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | boolean/string[] | Current value |
| `label` | string | Checkbox label |
| `options` | OptionItem[] | Multi-select group options |
| `onChange` | Action[] | Triggered on value change |

### radio

Radio button group.

```json
{
  "type": "radio",
  "options": [
    { "label": "Male", "value": "male" },
    { "label": "Female", "value": "female" }
  ]
}
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | string | Current value |
| `options` | OptionItem[] | `{ label, value }` array |
| `onChange` | Action[] | Triggered on value change |

### date-picker

Date picker.

```json
{ "type": "date-picker", "format": "YYYY-MM-DD" }
```

| Property | Type | Description |
|----------|------|-------------|
| `value` | string | Current value |
| `format` | string | Date format |
| `onChange` | Action[] | Triggered on value change |

## Interaction Components

### button

Button that triggers an Action on click.

```json
{
  "type": "button",
  "label": "Submit",
  "variant": "primary",
  "action": { "type": "api", "method": "POST", "url": "/fn/submit" }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Button text |
| `action` | Action/Action[] | Action(s) triggered on click |
| `variant` | string | Style: `primary`, `secondary`, `danger`, `ghost` |
| `disabled` | string/boolean | Whether disabled (supports expressions) |
| `loading` | string/boolean | Whether to show loading state |

### link

Text link that triggers an Action on click.

```json
{ "type": "link", "text": "View details", "action": { "type": "link", "url": "/pages/detail" } }
```

| Property | Type | Description |
|----------|------|-------------|
| `text` | string | Link text |
| `action` | Action/Action[] | Action(s) triggered on click |

## Feedback Components

### dialog

Dialog container (typically opened via dialog action, not placed directly in body).

```json
{ "type": "dialog", "title": "Confirm", "width": 500, "children": [...] }
```

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Dialog title |
| `children` | Component[] | Content |
| `width` | number/string | Width |

### alert

Alert message.

```json
{ "type": "alert", "message": "Changes saved successfully", "alertType": "success" }
```

| Property | Type | Description |
|----------|------|-------------|
| `message` | string | Alert text |
| `alertType` | string | Type: `info`, `success`, `warning`, `error` |

### empty

Empty state placeholder.

```json
{ "type": "empty", "message": "No data available" }
```

| Property | Type | Description |
|----------|------|-------------|
| `message` | string | Placeholder text |

## ApiConfig

The `table`, `list`, and `form` components use `api` to configure their data source:

```json
{
  "api": {
    "method": "GET",
    "url": "/fn/_db/tables/todo",
    "params": {
      "order": "created_at.desc",
      "where": "completed.eq.0"
    }
  }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `method` | string | HTTP method (default GET) |
| `url` | string | API path (APP-relative path) |
| `params` | object | URL query parameters (values support expressions) |

## Custom Components

Declare reusable components in the top-level `components` section of `pages.json`:

```json
{
  "components": {
    "user-card": {
      "props": {
        "name": { "type": "string", "required": true },
        "role": { "type": "string", "default": "member" }
      },
      "body": {
        "type": "card",
        "title": "${props.name}",
        "children": [
          { "type": "tag", "text": "${props.role}" }
        ]
      }
    }
  }
}
```

Using custom components:
```json
{ "type": "user-card", "props": { "name": "Alice", "role": "admin" } }
```
