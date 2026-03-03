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
See `get_guide("ui/common-properties")` for shared JSON fields.
See `get_guide("ui/styling")` for `style` / `className` usage and limits.

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

Base properties shared by all built-in and custom component instances:

| Property | Type | Description |
|----------|------|-------------|
| `type` | string | Component type (required). Use a built-in type like `table`, or a custom component key from top-level `components`. |
| `id` | string | Optional component ID. Use when other expressions or actions need to reference this component, such as `${filters.value}` or `reload.target`. |
| `visible` | string/boolean | Conditional visibility. Supports expressions; `false` and `"false"` both hide the component. |
| `className` | string | Extra CSS class names added to the component's root element. |
| `style` | object | Inline style object applied to the component's root element. Style values may use expressions. |

Custom component instances also support:

| Property | Type | Description |
|----------|------|-------------|
| `props` | object | Props passed into a custom component template and exposed as `${props.xxx}` inside that template. |

See `get_guide("ui/common-properties")` for full semantics and `get_guide("ui/styling")` for supported style keys and examples.
