**Language:** English | [中文](README_CN.md)

# Cozybase

Cozybase is a local Backend-as-a-Service (BaaS) for AI Agents.

It gives an AI Agent a complete app-building runtime: database migrations, TypeScript functions, declarative UI pages, and a safe Draft-to-Stable publish flow. Users describe the app in natural language, the AI Agent builds and tests the app through Cozybase, and Cozybase serves the app locally.

> [!WARNING]
> Cozybase is currently in alpha. APIs and data formats may still change, and bugs are expected. Use it carefully and avoid relying on it for critical production workloads yet.

## Features

- **AI-Driven App Building** — Built-in AI chat panel lets you describe apps in natural language; the agent handles schema, functions, UI, and deployment.
- **Draft / Stable Environments** — Every app has isolated Draft and Stable runtimes. Changes are tested in Draft before publishing.
- **TypeScript Functions** — Write server-side logic as TypeScript functions, executed in a sandboxed runtime.
- **Declarative UI Pages** — Build app UIs with a declarative component model powered by React and Radix UI.
- **MCP / ACP Protocol** — Expose the full workflow over MCP so you can plug in your own coding agent (Claude Code, Cursor, etc.).
- **Desktop App** — Optional Tauri-based native desktop wrapper.

## Installation

### Prerequisites

- [Codex](https://github.com/openai/codex) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed on your machine.

### Install Cozybase

1. Go to the [Releases](https://github.com/wcp1231/cozybase/releases) page and download the latest `.app` (macOS) file.
2. Open the downloaded file and drag **Cozybase** into your `Applications` folder.
3. Launch Cozybase from Applications.

## Development Guide

### Repository Layout

```text
packages/
├── daemon          # Core server, workspace management, publish/reconcile, MCP/ACP, CLI
├── runtime         # Lightweight function execution and DB route runtime
├── ui              # Shared React UI component library (Radix UI + TailwindCSS v4)
├── web             # Browser SPA shell and built-in AI chat (React 19 + Vite)
├── desktop         # Tauri 2 native desktop wrapper
├── ai-runtime      # AI runtime abstractions (Claude, Codex, Pi Agent)
├── builder-agent   # AI agent for building/modifying apps
├── cozybase-agent  # Cozybase-specific agent implementation
└── operator-agent  # Agent for operational tasks
```

### Common Commands

```bash
bun run dev                  # Start daemon + web development flow
bun run desktop:dev          # Start desktop app (Tauri dev mode)
bun run desktop:build        # Build desktop app for distribution
bun run desktop:build:adhoc  # Build and ad-hoc sign the nightly-ready app archive
```

## More Documentation

User-facing guides live under [`docs/`](./docs/):

- [What Is Cozybase](./docs/what-is-cozybase.md)
- [Getting Started](./docs/getting-started.md)
- [Build Your First App With AI Agent](./docs/build-your-first-app-with-ai-agent.md)
- [Draft vs Stable](./docs/draft-vs-stable.md)
- [Publish and Safety](./docs/publish-and-safety.md)
- [Prompt Examples](./docs/prompt-examples.md)
- [Use Your Own Agent](./docs/use-your-own-agent.md)
- [UI Editor](./docs/ui-editor.md)

Internal reference docs for AI Agents live under `packages/daemon/guides/`.
