# Cozybase

Local BaaS (Backend as a Service) platform for AI Agents. Built with TypeScript, Bun, and SQLite.

Cozybase runs as a daemon process, binds to a workspace directory, and auto-discovers apps defined as YAML specs. Schema changes are reconciled automatically — no migrations to run manually.

```
Workspace (git-managed)          cozybase daemon              Data Directory
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│ todo-app/        │        │ Reconciler       │        │ cozybase.sqlite  │
│   app.yaml       │───────>│ Watcher          │───────>│ apps/            │
│   tables/        │ watch  │ HTTP Server      │ apply  │   todo-app/      │
│     todos.yaml   │        │ Event Bus        │        │     db.sqlite    │
│ blog-app/        │        │                  │        │   blog-app/      │
│   app.yaml       │        │                  │        │     db.sqlite    │
│   tables/...     │        │                  │        │                  │
└──────────────────┘        └──────────────────┘        └──────────────────┘
   Source of truth              Engine                    Runtime state
```

