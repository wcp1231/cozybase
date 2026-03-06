# Skill: Edit UI

Create new UI pages or modify existing pages in a Cozybase APP.

## When to Use

Use this skill when the user wants to:
- Add a new page with components
- Modify, rearrange, or replace components on an existing page
- Add components to an existing page

## Steps

### Step 1: Identify the APP and Requirements

- Which APP? (use `list_apps` if needed)
- New page or editing an existing page?
- What components are needed? (tables, forms, stats, etc.)
- What data sources does it use?

### Step 2: Read Existing UI

Fetch the APP with `fetch_app` if not already in the working directory.

```
pages_list(app_name: "my-app")        # see existing pages
ui_outline(app_name: "my-app")        # view component tree
ui_get(app_name: "my-app", node_id: "some-id")  # inspect a specific node
```

### Step 3: Design and Edit the Page

For guides:
```
get_guide("ui/components")             # component reference
get_guide("ui/components/table")       # data tables
get_guide("ui/components/form")        # forms
get_guide("ui/components/dialog")      # modal dialogs
get_guide("ui/actions")                # API calls, dialogs, navigation
get_guide("ui/expressions")            # ${...} syntax
get_guide("ui/batch")                  # ui_batch operations reference
```

**Always use `ui_batch` as the primary editing tool.** Never manually edit `ui/pages.json`.

#### Creating a New Page

Use `page_add` + `insert` operations in a single batch:

```
ui_batch(app_name: "my-app", operations: [
  { op: "page_add", ref: "$page", id: "user-list", title: "User List" },
  { op: "insert", ref: "$header", parent_id: "$page", node: { type: "row", justify: "between", align: "center" } },
  { op: "insert", parent_id: "$header", node: { type: "heading", level: 2, text: "Users" } },
  { op: "insert", parent_id: "$header", node: { type: "button", label: "Open Create Form", action: { type: "dialog", title: "Add User", body: { type: "form", fields: [
    { name: "name", label: "Name", type: "input" },
    { name: "email", label: "Email", type: "input" }
  ], api: { url: "/fn/_db/tables/users", method: "POST" } } } } },
  { op: "insert", parent_id: "$page", node: { type: "table", api: { url: "/fn/_db/tables/users", method: "GET" }, columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Name" },
    { name: "email", label: "Email" }
  ] } }
])
```

#### Editing an Existing Page

First understand the current structure:

```
ui_outline(app_name: "my-app", page_id: "user-list")  # see component tree
ui_get(app_name: "my-app", node_id: "tbl-users")      # inspect specific node
```

Then use `ui_batch` to make changes:

```
# Update existing components
ui_batch(app_name: "my-app", operations: [
  { op: "update", node_id: "heading-abc", props: { text: "Updated Title" } },
  { op: "update", node_id: "tbl-users", props: { columns: [
    { name: "id", label: "ID" },
    { name: "name", label: "Full Name" },
    { name: "email", label: "Email" },
    { name: "role", label: "Role" }
  ] } }
])
```

```
# Add components to an existing page (no page_add needed)
ui_batch(app_name: "my-app", operations: [
  { op: "insert", parent_id: "user-list", node: { type: "heading", text: "Statistics" }, index: 0 },
  { op: "insert", ref: "$row", parent_id: "user-list", node: { type: "row", gap: 4 }, index: 1 },
  { op: "insert", parent_id: "$row", node: { type: "stat", label: "Total Users", value: "${stats.total}" } },
  { op: "insert", parent_id: "$row", node: { type: "stat", label: "Active", value: "${stats.active}" } }
])
```

```
# Replace a component (delete old + insert new)
ui_batch(app_name: "my-app", operations: [
  { op: "delete", node_id: "old-component-id" },
  { op: "insert", parent_id: "user-list", node: { type: "heading", level: 3, text: "New Section" } }
])
```

```
# Move a component to a different parent
ui_batch(app_name: "my-app", operations: [
  { op: "move", node_id: "btn-submit", new_parent_id: "row-actions", index: 0 }
])
```

### Step 4: Follow the Standard Workflow

Upload, reconcile, test, verify, and publish following the standard development workflow (see `get_guide("workflow")` Steps 3-7).

After any UI edit, sync with: `update_app_file(app_name: "my-app", path: "ui/pages.json")`

When nested payload JSON must point at the inserted component itself, use `"$self"`:
- Example: `{ "type": "reload", "target": "$self" }`

When one batch operation needs to reference a component created by an earlier batch operation inside nested JSON, use that earlier operation's `ref` as an exact string value:
- Example: `{ "type": "reload", "target": "$table" }`

## Common Page Patterns

### Data Listing Page
- Row (heading + "Add" button)
- Table with columns and row actions
- Dialog with form for create/edit

### Dashboard Page
- Row of Stat components
- Tables or charts below

### Detail Page
- Card with data fields
- Action buttons (Edit, Delete)

### Form Page
- Heading
- Form with fields, validation, and submit action

## Tips

- New components always receive generated IDs; use `"$self"` or earlier batch refs when nested JSON needs the generated ID in the same call
- Use tabs with `${tabs-id.value}` in table `api.params` for filtering
- Put forms inside `dialog` actions for create/edit workflows
- Chain actions on existing, already-known component IDs: `onSuccess: [{ "type": "reload", "target": "existing-table-id" }, { "type": "close" }]`
- Use `index` parameter to control insertion position within a parent
- Use `$ref` to chain operations: insert a container, then insert children into it
