## Why

AI Agent 通过 MCP 连接 Cozybase 后，仅能看到 11 个工具的简短描述，缺少 APP 开发流程、函数编写、UI 组件 schema、数据库操作等关键知识。Agent 需要 **更完整的文档体系** 才能有效地创建和管理 APP，而不是靠猜测和试错。

## What Changes

- 新增 `get_guide(topic)` MCP 工具，支持层级化 topic 路径（如 `ui`、`ui/components`、`ui/components/table`），按需返回详细参考文档
- 新增 `guides/` 目录，存放面向 AI Agent 的 markdown 参考文档，按 topic 路径组织
- 新增 `templates/workspace/` 目录，包含 `AGENT.md` 和 `.claude/skills/` 模板文件
- 新增 `cozybase init` CLI 子命令，初始化 Agent Workspace 目录，scaffold AGENT.md 和 Skills 文件
- 精简现有 MCP 工具描述，移除 `update_app_file` 中内嵌的 UI 文档，改为交叉引用 `get_guide()`

## Capabilities

### New Capabilities
- `agent-guides`: 面向 AI Agent 的层级化参考文档体系，包含 `get_guide(topic)` MCP 工具实现和 `guides/` 内容文件的组织结构与加载机制
- `workspace-init`: `cozybase init` CLI 子命令，初始化 Agent Workspace 目录并 scaffold AGENT.md 和 Skills 模板文件

### Modified Capabilities
- `mcp-tools`: 新增 `get_guide` 工具注册；精简现有工具描述，将详细文档替换为 `get_guide()` 交叉引用
- `cli-entry`: 新增 `init` 子命令

## Impact

- `packages/daemon/src/mcp/` — 新增 guide handler，修改 server.ts 注册新工具，修改 mcp-types.ts 精简工具描述
- `packages/daemon/guides/` — 新增目录，存放所有 markdown 参考文档
- `packages/daemon/templates/workspace/` — 新增目录，存放 AGENT.md 和 Skills 模板
- `packages/daemon/src/cli.ts` — 新增 `init` 子命令
- 不涉及 runtime、ui、admin 包的变更
- 不涉及 breaking change
