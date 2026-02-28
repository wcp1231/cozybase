# UI System

Cozybase uses declarative JSON to define APP UI pages, stored in the `ui/pages.json` file.

## File Structure

```json
{
  "pages": [
    {
      "id": "page-id",
      "title": "Page Title",
      "body": [ ... ]
    }
  ],
  "components": {
    "my-card": { ... }
  }
}
```

- **pages** — Array of pages, each with `id` (also used as the route path), `title`, and `body`
- **components** — Optional, custom reusable component declarations

## Component System

Each element in `body` is a component object, identified by its `type` field.

26 built-in component types:

| Category | Components |
|----------|------------|
| Layout | `page`, `row`, `col`, `card`, `tabs`, `divider` |
| Data Display | `table`, `list`, `text`, `heading`, `tag`, `stat` |
| Data Input | `form`, `input`, `textarea`, `number`, `select`, `switch`, `checkbox`, `radio`, `date-picker` |
| Interaction | `button`, `link` |
| Feedback | `dialog`, `alert`, `empty` |

See `get_guide("ui/components")` for details.

## Interaction System

Components declare interactive behavior through **Actions**:

6 Action types: `api`, `reload`, `dialog`, `link`, `close`, `confirm`

See `get_guide("ui/actions")` for details.

## Expressions

Use `${...}` syntax to embed dynamic values in component properties:

```json
{ "text": "${row.title}" }
{ "color": "${row.completed === 1 ? 'success' : 'default'}" }
```

See `get_guide("ui/expressions")` for details.

## Common Component Properties

Base properties shared by all components:

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Component type (required) |
| `id` | string | Component ID (used for reload, expression references, etc.) |
| `visible` | string/boolean | Controls visibility, supports expressions |
| `className` | string | CSS class name |
| `style` | object | Inline styles |
