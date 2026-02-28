# Button

Button that triggers an action on click.

## Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `label` | string | Yes | Button text |
| `action` | Action/Action[] | Yes | Action(s) triggered on click |
| `variant` | string | No | Style variant: `primary`, `secondary`, `danger`, `ghost` |
| `disabled` | string/boolean | No | Whether disabled (supports expressions) |
| `loading` | string/boolean | No | Whether to show loading state |

## Examples

Primary action button:

```json
{
  "type": "button",
  "label": "Save",
  "variant": "primary",
  "action": {
    "type": "api",
    "method": "POST",
    "url": "/fn/_db/tables/items",
    "onSuccess": [{ "type": "reload", "target": "items-table" }]
  }
}
```

Open a dialog:

```json
{
  "type": "button",
  "label": "New Item",
  "variant": "primary",
  "action": {
    "type": "dialog",
    "title": "Create Item",
    "body": {
      "type": "form",
      "fields": [
        { "name": "title", "label": "Title", "type": "input", "required": true }
      ],
      "api": { "method": "POST", "url": "/fn/_db/tables/items" },
      "onSuccess": [
        { "type": "reload", "target": "items-table" },
        { "type": "close" }
      ]
    }
  }
}
```

Danger button with confirmation:

```json
{
  "type": "button",
  "label": "Delete All",
  "variant": "danger",
  "action": {
    "type": "confirm",
    "message": "Are you sure you want to delete all items?",
    "onConfirm": {
      "type": "api",
      "method": "DELETE",
      "url": "/fn/items/clear",
      "onSuccess": [{ "type": "reload", "target": "items-table" }]
    }
  }
}
```

Conditionally disabled:

```json
{
  "type": "button",
  "label": "Submit",
  "variant": "primary",
  "disabled": "${search-input.value === ''}",
  "action": {...}
}
```
