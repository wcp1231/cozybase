# Markdown Component

Display long-form Markdown content with safe GFM rendering.

## Behavior

- Supports headings, lists, blockquotes, code fences, tables, inline code, and links
- Supports `${...}` expressions in `content`
- Does **not** render raw HTML blocks as DOM
- Links open in a new tab with safe `rel` attributes

## Basic Usage

```json
{
  "type": "markdown",
  "id": "help-copy",
  "content": "## Getting Started\n\n1. Create a record\n2. Review the result\n3. Publish when ready"
}
```

## Dynamic Content

```json
{
  "type": "markdown",
  "id": "ai-report",
  "content": "${report-panel.data.summary}"
}
```

> Use `markdown` when the content is already a Markdown string. If you need to fetch remote data, keep using existing data components and pass the resulting string into `content` via expressions.

## Properties

<!-- AUTO-GENERATED-PROPS:START -->
| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `content` | `string` | Yes | Markdown content to render. Supports expressions. |
<!-- AUTO-GENERATED-PROPS:END -->

