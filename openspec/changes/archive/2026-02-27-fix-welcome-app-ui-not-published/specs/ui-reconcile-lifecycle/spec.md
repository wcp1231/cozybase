## MODIFIED Requirements

### Requirement: Draft/Stable UI 读取 API

系统 SHALL 提供 HTTP 端点，从 Draft 或 Stable 文件系统读取已 reconcile 的 UI 定义。

端点定义：
- `GET /draft/apps/:appName/ui` — 读取 `draft/apps/{appName}/ui/pages.json`
- `GET /stable/apps/:appName/ui` — 读取 `data/apps/{appName}/ui/pages.json`

响应格式：
- 成功：`{ "data": <parsed JSON content of pages.json> }`（Content-Type: application/json）
- 文件不存在：`404 { "error": "UI definition not found" }`

这些端点 SHALL 遵循现有的 Draft/Stable 路由中间件规则（App 状态校验、deleted App 返回 404 等）。

**实现要求**：上述端点 SHALL 在 `packages/runtime` 模块的 UI 路由（`createUiRoutes()`）中实现，注册路径为 `GET /ui`（替代原有的 `GET /ui.json`），通过 `appEntryResolver` 中间件获取 `uiDir`，读取 `uiDir/pages.json` 并返回。原 `GET /ui.json` 路由 SHALL 移除，不再保留。

#### Scenario: 读取 Stable UI 定义

- **WHEN** 发送 `GET /stable/apps/todo-app/ui`，且 `data/apps/todo-app/ui/pages.json` 存在
- **THEN** 系统 SHALL 返回 200，body 为 `{ "data": <pages.json 的解析后内容> }`

#### Scenario: 读取 Draft UI 定义

- **WHEN** 发送 `GET /draft/apps/todo-app/ui`，且 `draft/apps/todo-app/ui/pages.json` 存在
- **THEN** 系统 SHALL 返回 200，body 为 `{ "data": <pages.json 的解析后内容> }`

#### Scenario: UI 文件不存在

- **WHEN** 发送 `GET /stable/apps/todo-app/ui`，但 `data/apps/todo-app/ui/pages.json` 不存在
- **THEN** 系统 SHALL 返回 404，body 为 `{ "error": "UI definition not found" }`

#### Scenario: Deleted App 的 UI 请求

- **WHEN** 发送 `GET /stable/apps/deleted-app/ui`，该 App 状态为 deleted
- **THEN** 系统 SHALL 返回 404（由现有路由中间件处理）

#### Scenario: Daemon 启动后 Welcome App UI 可访问

- **WHEN** 无 workspace 启动 Daemon，Welcome App 自动 publish 完成后，发送 `GET /stable/apps/welcome/ui`
- **THEN** 系统 SHALL 返回 200，body 为 `{ "data": <welcome app 的 pages.json 内容> }`
