# Expressions

Expressions use `${...}` syntax to embed dynamic values in UI component properties.

## Basic Syntax

### Pure Expressions

When the entire property value is `${...}`, the raw value is returned (numbers, objects, etc. are not converted to strings):

```json
{ "text": "${row.title}" }
```

### Template Strings

When the property value contains `${...}` mixed with other text, the result is a concatenated string:

```json
{ "text": "Total: ${response.data.count} items" }
```

## Scopes

Expressions can access the following context variables:

| Scope | Description | Available In |
|-------|-------------|--------------|
| `row` | Current table/list row data | table columns, rowActions, list items |
| `form` | Current form field values | Components inside form |
| `params` | URL query parameters | All components |
| `response` | API response data | onSuccess/onError callbacks |
| `props` | Custom component props | Inside custom components |
| `{id}.value` | Component's current value | Global (requires component to have an id) |
| `{id}.data` | Component's data | Global (requires component to have an id) |

### Component Value References

Reference a component's value via its ID (`{id}.value`):

```json
{
  "type": "tabs",
  "id": "status-tabs",
  "items": [
    { "label": "All", "value": "" },
    { "label": "Pending", "value": "0" }
  ]
}
```

Reference the tabs' selected value in other components:

```json
{
  "type": "table",
  "api": {
    "url": "/fn/_db/tables/todo",
    "params": {
      "completed": "${status-tabs.value}"
    }
  }
}
```

## Supported Operations

### Property Paths

```
${row.title}
${response.data.items}
${form.email}
```

Supports deep nesting: `${response.meta.pagination.total}`

### Ternary Expressions

```
${row.completed === 1 ? 'Done' : 'Pending'}
${row.score >= 60 ? 'Pass' : 'Fail'}
```

### Comparison Operations

```
${row.status === 'active'}
${row.count !== 0}
```

Supports `===` and `!==`.

### Literals

```
${true}
${false}
${null}
${undefined}
${'hello'}
${42}
${3.14}
```

## Usage Examples

### Conditional Styling

```json
{
  "type": "tag",
  "text": "${row.completed === 1 ? 'Completed' : 'Pending'}",
  "color": "${row.completed === 1 ? 'success' : 'default'}"
}
```

### Dynamic URLs

```json
{
  "type": "api",
  "method": "PATCH",
  "url": "/fn/_db/tables/todo/${row.id}",
  "body": { "completed": "${row.completed === 1 ? 0 : 1}" }
}
```

### Dynamic Labels

```json
{
  "label": "${row.completed === 1 ? 'Mark Pending' : 'Mark Completed'}"
}
```

### Form Data Submission

```json
{
  "type": "api",
  "method": "POST",
  "url": "/fn/_db/tables/todo",
  "body": {
    "title": "${form.title}",
    "category": "${form.category}"
  }
}
```

### Conditional Visibility

```json
{
  "type": "text",
  "visible": "${row.status === 'error'}",
  "text": "Something went wrong"
}
```
