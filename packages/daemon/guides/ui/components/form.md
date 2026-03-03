# Form Component

Form component for collecting user input and submitting to an API.

## Basic Usage

```json
{
  "type": "form",
  "fields": [
    { "name": "title", "label": "Title", "type": "input", "required": true },
    { "name": "description", "label": "Description", "type": "textarea" }
  ],
  "api": {
    "method": "POST",
    "url": "/fn/_db/tables/todo"
  },
  "onSuccess": [
    { "type": "reload", "target": "todo-table" },
    { "type": "close" }
  ]
}
```

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `fields` | `FieldSchema[]` | Yes | Form field definitions |
| `api` | `ApiConfig` | No | Submission target API |
| `onSuccess` | `Action/Action[]` | No | Executed after successful submission |
| `onError` | `Action/Action[]` | No | Executed after failed submission |
| `initialValues` | `object` | No | Initial values |
| `layout` | `'vertical' \| 'horizontal' \| 'inline'` | No | Layout: `vertical` (default), `horizontal`, `inline` |
<!-- AUTO-GENERATED-PROPS:END -->

## Field Definition (FieldSchema)

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Field name (corresponds to the key in submitted data) |
| `label` | string | No | Field label |
| `type` | string | Yes | Input type |
| `required` | boolean | No | Whether required |
| `placeholder` | string | No | Placeholder text |
| `options` | OptionItem[] | No | Options (used by select/radio/checkbox) |
| `defaultValue` | any | No | Default value |

### Supported Field Types

| type | Component | Description |
|------|-----------|-------------|
| `input` | InputComponent | Text input |
| `textarea` | TextareaComponent | Multi-line text |
| `number` | NumberComponent | Number input |
| `select` | SelectComponent | Dropdown select |
| `switch` | SwitchComponent | Toggle switch |
| `checkbox` | CheckboxComponent | Checkbox |
| `radio` | RadioComponent | Radio button group |
| `date-picker` | DatePickerComponent | Date picker |

## Usage in Dialog

Forms are commonly used with Dialog Actions to create modal forms:

```json
{
  "type": "button",
  "label": "New Todo",
  "variant": "primary",
  "action": {
    "type": "dialog",
    "title": "New Todo",
    "body": {
      "type": "form",
      "fields": [
        {
          "name": "title",
          "label": "Title",
          "type": "input",
          "required": true,
          "placeholder": "Enter todo title..."
        },
        {
          "name": "priority",
          "label": "Priority",
          "type": "select",
          "options": [
            { "label": "High", "value": "high" },
            { "label": "Medium", "value": "medium" },
            { "label": "Low", "value": "low" }
          ],
          "defaultValue": "medium"
        }
      ],
      "api": {
        "method": "POST",
        "url": "/fn/_db/tables/todo"
      },
      "onSuccess": [
        { "type": "reload", "target": "todo-table" },
        { "type": "close" }
      ]
    }
  }
}
```

## Edit Form (with Initial Values)

When editing existing data, use `initialValues` or expressions to pre-fill fields:

```json
{
  "type": "dialog",
  "title": "Edit Todo",
  "body": {
    "type": "form",
    "fields": [
      { "name": "title", "label": "Title", "type": "input", "required": true }
    ],
    "initialValues": {
      "title": "${row.title}"
    },
    "api": {
      "method": "PATCH",
      "url": "/fn/_db/tables/todo/${row.id}"
    },
    "onSuccess": [
      { "type": "reload", "target": "todo-table" },
      { "type": "close" }
    ]
  }
}
```

## Form Data References

Inside a form, expressions can reference current form values using `${form.fieldName}`:

```json
{
  "type": "text",
  "visible": "${form.role === 'admin'}",
  "text": "Admin users have full access."
}
```

When a form has an `api` configured, all field values are automatically sent as the JSON request body on submission. The submitted payload always includes every field — individual field selection or remapping is not supported.

## Passing Extra Parameters via api.params

Use `api.params` to pass contextual parameters (e.g., from the page URL or row data) alongside the form submission. Params are appended as **URL query parameters** — they are NOT merged into the request body.

```json
{
  "type": "form",
  "fields": [
    { "name": "note", "label": "Note", "type": "textarea" }
  ],
  "api": {
    "method": "POST",
    "url": "/fn/upsert-record",
    "params": {
      "baby_id": "${params.baby_id}",
      "allergen_id": "${row.id}"
    }
  },
  "onSuccess": [{ "type": "reload", "target": "records-table" }, { "type": "close" }]
}
```

This sends: `POST /fn/upsert-record?baby_id=42&allergen_id=7` with `{ "note": "..." }` as the JSON body.

In the function, read params from the URL and field values from the body:

```typescript
export async function POST(ctx) {
  const url = new URL(ctx.req.url);
  const babyId = url.searchParams.get('baby_id');
  const allergenId = url.searchParams.get('allergen_id');
  const body = await ctx.req.json();

  ctx.db.run(
    'INSERT OR REPLACE INTO records (baby_id, allergen_id, note) VALUES (?, ?, ?)',
    [babyId, allergenId, body.note]
  );
  return { data: [{ baby_id: babyId, allergen_id: allergenId, note: body.note }] };
}
```
