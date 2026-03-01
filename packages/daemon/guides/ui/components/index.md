# Components

Catalog of 26 built-in UI components. Each uses the `type` field to specify its kind. All share base properties `id`, `visible`, `className`, and `style`. For full details on any component, call `get_guide("ui/components/<name>")`.

## Layout Components

### page
Container with a title and child components. Props: `title` (string), `children` (Component[]).

### row
Horizontal layout. Props: `children` (Component[]), `justify` (`start`|`end`|`center`|`space-between`|`space-around`), `align` (`start`|`center`|`end`|`stretch`), `gap` (number, px), `wrap` (boolean).

### col
Vertical layout. Props: `children` (Component[]), `align` (`start`|`center`|`end`|`stretch`), `gap` (number, px).

### card
Card container with optional title. Props: `title` (string), `children` (Component[]), `padding` (number, px).

### tabs
Tab switcher for filtering or content grouping. Reference selected value via `${tabs-id.value}`. Props: `items` (TabItem[]), `defaultValue` (string). TabItem: `{ label, value, body? }` — `body` displays content when selected. → `get_guide("ui/components/tabs")`

### divider
Separator line. Props: `label` (string).

## Data Display Components

### table
Data table with API data source, custom column rendering, row actions, and pagination. → `get_guide("ui/components/table")`

### list
List with API data source and custom item rendering. Props: `api` (ApiConfig), `itemRender` (Component — use `${row.xxx}`).

### text
Text display. Props: `text` (string, supports expressions).

### heading
Heading text. Props: `text` (string, supports expressions), `level` (1-6, default 1).

### tag
Tag / badge. Props: `text` (string, supports expressions), `color` (`default`|`success`|`warning`|`error`|`info` or custom).

### stat
Statistical value display. Props: `label` (string), `value` (string/number, supports expressions), `prefix` (string), `suffix` (string).

## Data Input Components

### form
Form for collecting input and submitting to an API. Supports field types: input, textarea, number, select, switch, checkbox, radio, date-picker. → `get_guide("ui/components/form")`

### input
Text input. Props: `value` (string), `placeholder` (string), `onChange` (Action[]).

### textarea
Multi-line text input. Props: `value` (string), `placeholder` (string), `rows` (number), `onChange` (Action[]).

### number
Number input. Props: `value` (number), `min` (number), `max` (number), `step` (number), `onChange` (Action[]).

### select
Dropdown selector. Props: `value` (string/string[]), `options` (OptionItem[]: `{ label, value }`), `multiple` (boolean), `placeholder` (string), `onChange` (Action[]). → `get_guide("ui/components/select")`

### switch
Toggle switch. Props: `value` (boolean), `onChange` (Action[]).

### checkbox
Checkbox — single or multi-select group. Props: `value` (boolean/string[]), `label` (string), `options` (OptionItem[]), `onChange` (Action[]).

### radio
Radio button group. Props: `value` (string), `options` (OptionItem[]: `{ label, value }`), `onChange` (Action[]).

### date-picker
Date picker. Props: `value` (string), `format` (string), `onChange` (Action[]).

## Interaction Components

### button
Button that triggers an action on click. Props: `label` (string), `action` (Action/Action[]), `variant` (`primary`|`secondary`|`danger`|`ghost`), `disabled` (string/boolean, supports expressions), `loading` (string/boolean). → `get_guide("ui/components/button")`

### link
Text link that triggers an action on click. Props: `text` (string), `action` (Action/Action[]).

## Feedback Components

### dialog
Dialog container (typically opened via `dialog` action, not placed directly in body). Props: `title` (string), `children` (Component[]), `width` (number/string). → `get_guide("ui/components/dialog")`

### alert
Alert message. Props: `message` (string), `alertType` (`info`|`success`|`warning`|`error`).

### empty
Empty state placeholder. Props: `message` (string).

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

**Response format:** The `table` and `list` components expect the API to return `{ "data": [...] }`. The built-in CRUD API returns this automatically. Custom functions must wrap results: `return { data: rows }`. See `get_guide("ui/components/table")` for details.

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
