# Link

Text link that triggers an action on click.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `text` | `string` | Yes | Link text |
| `action` | `Action \| Action[]` | Yes | Action(s) triggered on click |
<!-- AUTO-GENERATED-PROPS:END -->

## Examples

Navigation link:

```json
{
  "type": "link",
  "text": "View details",
  "action": { "type": "link", "url": "/apps/my-app/detail" }
}
```

Link that opens a dialog:

```json
{
  "type": "link",
  "text": "Edit profile",
  "action": {
    "type": "dialog",
    "title": "Edit Profile",
    "body": {
      "type": "form",
      "fields": [
        { "name": "name", "label": "Name", "type": "input", "required": true }
      ],
      "api": { "method": "PATCH", "url": "/fn/_db/tables/users/${row.id}" },
      "onSuccess": [
        { "type": "reload", "target": "users-table" },
        { "type": "close" }
      ]
    }
  }
}
```

Note: The `link` component (this) is a UI element that renders clickable text. The `link` action type controls where clicking navigates to. They are often used together but are distinct concepts.
