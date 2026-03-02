# Local Backend

## Purpose

定义 daemon 内部供 SDK MCP Server 使用的 `LocalBackend`，以及 Agent 工作目录的初始化行为。

## Requirements

### Requirement: LocalBackend 实现 CozybaseBackend 接口
系统 SHALL 提供 `LocalBackend` 类，实现 `CozybaseBackend` 接口，通过直接调用 Workspace、DraftReconciler、Verifier、Publisher、AppRegistry 等核心对象完成操作，而非通过 HTTP。

`LocalBackend` SHALL 实现以下方法：
- `createApp` — 在 platform DB 中创建 App 并返回 AppSnapshot
- `listApps` — 列出所有 App 信息
- `fetchApp` — 获取 App 完整快照（含文件内容）
- `deleteApp` — 删除 App
- `startApp` / `stopApp` — 启停 Stable 运行时
- `pushFiles` — 全量同步文件到 platform DB
- `pushFile` — 单文件更新
- `reconcile` — 重建 Draft DB
- `verify` — 发布前验证
- `publish` — 发布到 Stable
- `executeSql` — 在 Draft/Stable DB 上执行 SQL
- `callApi` — 调用 App 的 function endpoint
- `inspectUi` — 通过 UiBridge 检查浏览器渲染的 UI

#### Scenario: 创建 App
- **WHEN** Agent 通过 SDK MCP Server 调用 `create_app` 工具
- **THEN** `LocalBackend.createApp()` 直接在 platform DB 中插入 App 记录并返回包含模板文件的 AppSnapshot，不经过 HTTP

#### Scenario: 发布 App
- **WHEN** Agent 调用 `publish_app` 工具
- **THEN** `LocalBackend.publish()` 直接调用 Publisher 执行发布流程，并在发布成功后通过 AppRegistry 重启 Stable 运行时

#### Scenario: 执行 SQL
- **WHEN** Agent 调用 `execute_sql` 工具，指定 `mode: 'draft'`
- **THEN** `LocalBackend.executeSql()` 在对应 App 的 Draft DB 上执行 SQL 并返回结果

### Requirement: 进程内 SDK MCP Server 注册
系统 SHALL 使用 Claude Agent SDK 的 `createSdkMcpServer()` 创建进程内 MCP Server，将所有现有 MCP 工具注册为 SDK MCP 工具。

工具注册 SHALL 复用：
- 现有的 `TOOL_DESCRIPTIONS` 常量作为工具描述
- 现有的 `handle*` 函数作为核心 handler 逻辑
- 现有的 Zod schemas 作为输入验证

SDK MCP Server SHALL 使用 `LocalBackend` 作为 `HandlerContext.backend`。

#### Scenario: 工具列表与现有 MCP Server 一致
- **WHEN** SDK MCP Server 初始化完成
- **THEN** 注册的工具集合 SHALL 与现有 stdio MCP Server 一致（包含 create_app、list_apps、fetch_app、update_app、update_app_file、delete_app、start_app、stop_app、reconcile_app、verify_app、publish_app、execute_sql、call_api、inspect_ui、get_guide）

#### Scenario: 工具调用在 daemon 进程内执行
- **WHEN** Claude subprocess 通过 MCP protocol 调用工具
- **THEN** 工具 handler 在 daemon 进程内执行，直接调用 LocalBackend 方法，不 spawn 额外子进程

### Requirement: Agent 工作目录初始化
系统 SHALL 在 workspace 根目录下创建 `agent/` 目录作为 Agent 的工作目录。该目录下 SHALL 包含 `apps/` 子目录，用于存放各 App 的本地文件副本。

Agent 工作目录 SHALL 在 daemon 启动时自动创建（如不存在）。

#### Scenario: 首次启动创建目录
- **WHEN** daemon 启动且 workspace 中不存在 `agent/` 目录
- **THEN** 系统自动创建 `agent/` 和 `agent/apps/` 目录

#### Scenario: fetch_app 文件写入
- **WHEN** Agent 调用 `fetch_app` 工具获取 App 文件
- **THEN** 文件 SHALL 写入 `workspace/agent/apps/<app_name>/` 目录下
