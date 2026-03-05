# Skill: Add Page

Add a new UI page to an existing Cozybase APP.

## When to Use

Use this skill when the user wants to add a new page or modify existing UI in an APP.

## Steps

### Step 1: Identify the APP and Requirements

- Which APP? (use `list_apps` if needed)
- What should the page display? (tables, forms, stats, etc.)
- What data sources does it use?

### Step 2: Read Existing UI

Fetch the APP with `fetch_app` if not already in the working directory, then call `pages_list` to see existing pages and `ui_outline` to understand the current component structure.

### Step 3: Design and Add the Page

For the component reference, call `get_guide("ui/components")`.

For specific high-frequency components:
```
get_guide("ui/components/table")   # Data tables
get_guide("ui/components/form")    # Forms
get_guide("ui/components/dialog")  # Modal dialogs
```

For actions and expressions:
```
get_guide("ui/actions")            # API calls, dialogs, navigation
get_guide("ui/expressions")        # ${...} syntax
```

Add the page using the `pages_add` MCP tool:

```
pages_add(app_name, id="page-id", title="Page Title")
```

The `id` serves as the route path segment (lowercase alphanumeric and hyphens, e.g., `user-list`, `dashboard`).

Then use `ui_insert` to add components to the page body, targeting the page `id` as the parent.

**Never manually edit `ui/pages.json`** — always use the `pages_*` and `ui_*` MCP tools.

### Step 4: Follow the Standard Workflow

Upload, reconcile, test, verify, and publish following the standard development workflow (see `get_guide("workflow")` Steps 3-7).

## Common Page Patterns

### Data Listing Page
- Heading + Button (for "New" action)
- Optional filter tabs
- Table with columns and row actions

### Dashboard Page
- Row of Stat components
- Tables or Charts below

### Detail Page
- Card with data fields
- Action buttons (Edit, Delete)

## Tips

- Give tables and key components an `id` so they can be targeted by `reload` actions
- Use tabs with `${tabs-id.value}` in table `api.params` for filtering
- Put forms inside `dialog` actions for create/edit workflows
- Chain actions: `onSuccess: [{ "type": "reload", "target": "..." }, { "type": "close" }]`
