# Tabs

Tab switcher for data filtering or content grouping.

`tabs` includes a default container and tab-list baseline. In most apps, you only need to define `items` and optionally `defaultValue`.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `items` | `TabItem[][]` | Yes | Tab items |
| `defaultValue` | `string` | No | Default selected value |
<!-- AUTO-GENERATED-PROPS:END -->

### TabItem

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | string | Yes | Tab label |
| `value` | string | Yes | Tab value |
| `body` | Component[] | No | Content displayed when this tab is selected |

## Usage Modes

### Filter Mode

Use tabs as a filter for another component. Reference the selected value via `${tabs-id.value}`:

```json
[
  {
    "type": "tabs",
    "id": "status-tabs",
    "items": [
      { "label": "All", "value": "" },
      { "label": "Pending", "value": "0" },
      { "label": "Completed", "value": "1" }
    ]
  },
  {
    "type": "table",
    "api": {
      "url": "/fn/_db/tables/todo",
      "params": { "completed": "${status-tabs.value}" }
    },
    "columns": [...]
  }
]
```

When the selected tab changes, components referencing its value automatically reload.

### Content Mode

Use `body` on tab items to display different content per tab:

```json
{
  "type": "tabs",
  "items": [
    {
      "label": "Profile",
      "value": "profile",
      "body": [{ "type": "form", "fields": [...] }]
    },
    {
      "label": "Settings",
      "value": "settings",
      "body": [{ "type": "form", "fields": [...] }]
    }
  ]
}
```

Avoid adding redundant wrapper borders, padding, or tab-label typography unless you are intentionally overriding the default tabs presentation.
