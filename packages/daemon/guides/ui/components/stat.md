# Stat

Displays a statistical value with label and optional prefix/suffix.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | `string` | Yes | Metric name |
| `value` | `string \| number` | Yes | Displayed value (supports expressions) |
| `prefix` | `string` | No | Prefix text (e.g. `$`) |
| `suffix` | `string` | No | Suffix text (e.g. `%`) |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

```json
{ "type": "stat", "label": "Total Sales", "value": "12,340", "prefix": "$" }
```

With API data:

```json
{ "type": "stat", "label": "Active Users", "value": "${response.count}", "suffix": " users" }
```

Dashboard row of stats:

```json
{
  "type": "row",
  "gap": 16,
  "children": [
    { "type": "stat", "label": "Orders", "value": "128" },
    { "type": "stat", "label": "Revenue", "value": "4,200", "prefix": "$" },
    { "type": "stat", "label": "Growth", "value": "12.5", "suffix": "%" }
  ]
}
```
