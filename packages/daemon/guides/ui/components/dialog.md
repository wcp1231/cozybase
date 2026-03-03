# Dialog

Dialog component for displaying content or collecting user input in a modal window.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | `string` | Yes | Dialog title |
| `children` | `Component[]` | Yes | Child components rendered inside the dialog |
| `width` | `number \| string` | No | Dialog width |
<!-- AUTO-GENERATED-PROPS:END -->

## Opening via Action

Dialogs are typically opened via the `dialog` Action type, rather than placed directly in `body`:

```json
{
  "type": "button",
  "label": "Open Dialog",
  "action": {
    "type": "dialog",
    "title": "My Dialog",
    "body": {
      "type": "text",
      "text": "Dialog content here"
    }
  }
}
```

## Dialog Action Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `title` | string | Yes | Dialog title (supports expressions) |
| `body` | Component | Yes | Dialog content (any component) |
| `width` | number/string | No | Dialog width |

## Closing a Dialog

Use the `close` Action to close the current dialog:

```json
{ "type": "close" }
```

Common pattern: close the dialog after a successful form submission:

```json
{
  "type": "dialog",
  "title": "New Item",
  "body": {
    "type": "form",
    "fields": [...],
    "api": { "method": "POST", "url": "/fn/_db/tables/items" },
    "onSuccess": [
      { "type": "reload", "target": "items-table" },
      { "type": "close" }
    ]
  }
}
```

## Common Patterns

### Create Form Dialog

```json
{
  "type": "button",
  "label": "Add User",
  "variant": "primary",
  "action": {
    "type": "dialog",
    "title": "Add User",
    "body": {
      "type": "form",
      "fields": [
        { "name": "name", "label": "Name", "type": "input", "required": true },
        { "name": "email", "label": "Email", "type": "input", "required": true },
        { "name": "role", "label": "Role", "type": "select", "options": [
          { "label": "Admin", "value": "admin" },
          { "label": "User", "value": "user" }
        ]}
      ],
      "api": { "method": "POST", "url": "/fn/_db/tables/users" },
      "onSuccess": [
        { "type": "reload", "target": "users-table" },
        { "type": "close" }
      ]
    }
  }
}
```

### Edit Dialog (used in rowActions)

```json
{
  "label": "Edit",
  "action": {
    "type": "dialog",
    "title": "Edit User",
    "body": {
      "type": "form",
      "fields": [
        { "name": "name", "label": "Name", "type": "input", "required": true },
        { "name": "email", "label": "Email", "type": "input", "required": true }
      ],
      "initialValues": {
        "name": "${row.name}",
        "email": "${row.email}"
      },
      "api": { "method": "PATCH", "url": "/fn/_db/tables/users/${row.id}" },
      "onSuccess": [
        { "type": "reload", "target": "users-table" },
        { "type": "close" }
      ]
    }
  }
}
```

### Detail View Dialog

```json
{
  "label": "View",
  "action": {
    "type": "dialog",
    "title": "User Details",
    "body": {
      "type": "col",
      "gap": 8,
      "children": [
        { "type": "text", "text": "Name: ${row.name}" },
        { "type": "text", "text": "Email: ${row.email}" },
        { "type": "tag", "text": "${row.role}", "color": "${row.role === 'admin' ? 'warning' : 'default'}" }
      ]
    }
  }
}
```
