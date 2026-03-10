# Cozybase

Cozybase is a local BaaS for AI Agents.

It gives an AI Agent a complete app-building runtime: database migrations, TypeScript functions, declarative UI pages, and a safe Draft-to-Stable publish flow.

## What It Is

Cozybase is designed for an agent-driven workflow:

- the user describes the app in natural language
- the AI Agent builds and tests the app through Cozybase MCP tools
- Cozybase serves the app locally and manages Draft and Stable environments

Core ideas:

- `platform.sqlite` is the source of truth for app definitions
- each app has separate `draft` and `stable` runtimes
- published migrations are immutable
- the built-in web UI includes an AI chat interface for app creation and iteration

Conceptually, an app looks like this:

```text
my-app/
├── app.yaml
├── migrations/
├── seeds/
├── functions/
├── ui/
└── package.json
```

## How To Run It

Requirements:

- Bun

Start Cozybase:

```bash
bun install
bun run build:web
bun run dev
```

The built-in web UI is only served after `packages/web/dist` has been built.
If you run `bun run dev` without running `bun run build:web` first, visiting `/` on port 3000 will return `404 Not Found`.

Then open:

```text
http://localhost:3000
```

On first run, Cozybase initializes `~/.cozybase` and auto-publishes a sample `welcome` app.

## Shortest Path To Build An App With AI Agent

1. Build the web UI with `bun run build:web`, then start Cozybase with `bun run dev` and open the web UI.
2. Open the built-in AI chat panel.
3. Describe the app you want in natural language.
4. Let the agent iterate in Draft.
5. Review the result and confirm when you want it published to Stable.

Example prompts:

- "Build a todo app with create, complete, edit, and delete actions."
- "Create a lightweight CRM with customers, deals, and notes."
- "Add a dashboard page with overdue tasks and completion stats."
- "Change the schema to support priorities and due dates, then test the draft app."

What the agent does behind the scenes:

1. creates or fetches the app
2. edits app files
3. syncs changes back to Cozybase
4. reconciles the Draft runtime
5. tests with SQL and API calls
6. verifies against Stable
7. publishes only after explicit user confirmation

If you want to use your own coding agent instead of the built-in chat, Cozybase also exposes the same workflow over MCP:

```bash
bun run builder-mcp
bun packages/daemon/src/cli.ts init --apps-dir ./agent
```

## User Docs

User-facing documentation will live under `docs/`:

- [What Is Cozybase](./docs/what-is-cozybase.md)
- [Getting Started](./docs/getting-started.md)
- [Build Your First App With AI Agent](./docs/build-your-first-app-with-ai-agent.md)
- [Draft vs Stable](./docs/draft-vs-stable.md)
- [Publish and Safety](./docs/publish-and-safety.md)
- [Prompt Examples](./docs/prompt-examples.md)
- [Use Your Own Agent](./docs/use-your-own-agent.md)

The existing files under `packages/daemon/guides/` are internal reference docs for AI Agents and app implementation, not end-user documentation.

## Repository Layout

```text
packages/
├── daemon   # Workspace, publish/reconcile flow, MCP, web server
├── runtime  # Function execution, DB routes, UI runtime
├── ui       # Shared UI renderer and components
└── web      # Browser shell and built-in agent chat
```
