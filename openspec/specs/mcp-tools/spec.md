# MCP Tools

## Purpose

定义 Cozybase MCP tools 的注册、输入/输出约定，以及面向 Agent 的工具描述策略。

## Requirements

### Requirement: get_guide 工具注册

`createMcpServer` SHALL 注册 `get_guide` 工具，参数为 `{ topic: z.string() }`。

工具 handler SHALL 调用 guide handler 模块解析 topic 路径、读取对应 markdown 文件、追加子 topic 列表，返回文本内容。

#### Scenario: get_guide 工具可用

- **WHEN** MCP Server 启动
- **THEN** Agent 的工具列表中 SHALL 包含 `get_guide` 工具

#### Scenario: get_guide 调用成功

- **WHEN** Agent 调用 `get_guide(topic: "workflow")`
- **THEN** 工具 SHALL 返回 `{ content: [{ type: "text", text: "<markdown content>" }] }`

### Requirement: 精简现有工具描述

`TOOL_DESCRIPTIONS` 中的工具描述 SHALL 移除内嵌的详细文档，替换为 `get_guide()` 交叉引用。

具体变更：

- `update_app_file`: 移除内嵌的 UI 组件说明段（`pages`/`components`/`body`/`action` 等描述），替换为 `"For UI component reference, call get_guide('ui/components')."`
- `create_app`: 末尾追加 `"For the complete development workflow, call get_guide('workflow')."`
- `reconcile_app` / `verify_app` / `publish_app`: 末尾追加 `"For migration patterns, call get_guide('db/migrations')."`

#### Scenario: update_app_file 描述精简

- **WHEN** Agent 查看 `update_app_file` 工具的 description
- **THEN** description SHALL 不包含 UI 组件类型列表和 action 类型列表等详细文档
- **AND** description SHALL 包含 `get_guide('ui/components')` 的交叉引用

#### Scenario: create_app 包含 workflow 引用

- **WHEN** Agent 查看 `create_app` 工具的 description
- **THEN** description SHALL 包含 `get_guide('workflow')` 的交叉引用

#### Scenario: reconcile_app 包含 migration 引用

- **WHEN** Agent 查看 `reconcile_app` 工具的 description
- **THEN** description SHALL 包含 `get_guide('db/migrations')` 的交叉引用
