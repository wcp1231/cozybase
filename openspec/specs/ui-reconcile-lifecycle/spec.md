# UI Reconcile Lifecycle

## Purpose

Manage the export of UI definition files (`ui/pages.json`) from `app_files` to the filesystem during Draft Reconcile and Publish flows, and provide HTTP endpoints for reading the exported UI definitions.

## Requirements

### Requirement: UI 定义文件导出

系统 SHALL 支持将 `app_files` 表中 `path` 为 `ui/pages.json` 的记录导出为文件系统上的 JSON 文件。

导出目标路径：
- Draft 环境：`draft/apps/{appName}/ui/pages.json`
- Stable 环境：`data/apps/{appName}/ui/pages.json`

导出逻辑：
- 从 `app_files` 查询 `WHERE app_name = ? AND path = 'ui/pages.json'`
- 若记录存在，SHALL 将 `content` 写入目标路径（自动创建父目录）
- 若记录不存在，SHALL 跳过导出，不报错（部分 App 可能没有 UI）

#### Scenario: 导出 UI 定义到 Draft

- **WHEN** `app_files` 中存在 `{app_name: "todo-app", path: "ui/pages.json", content: "{\"pages\": [...]}"}`，执行 Draft Reconcile
- **THEN** 系统 SHALL 将 content 写入 `draft/apps/todo-app/ui/pages.json`

#### Scenario: 导出 UI 定义到 Stable

- **WHEN** 执行 Publish
- **THEN** 系统 SHALL 将 `ui/pages.json` 的 content 写入 `data/apps/todo-app/ui/pages.json`

#### Scenario: App 无 UI 定义

- **WHEN** `app_files` 中不存在该 App 的 `ui/pages.json` 记录
- **THEN** 系统 SHALL 跳过 UI 导出步骤，不报错，不影响其他 reconcile/publish 步骤

#### Scenario: UI 导出覆盖旧文件

- **WHEN** 目标路径已存在旧的 `ui/pages.json` 文件
- **THEN** 系统 SHALL 用新内容覆盖旧文件

### Requirement: UI 导出为非阻塞操作

UI 定义的导出 SHALL 不阻塞整体的 Reconcile 或 Publish 流程。

- 若 UI 文件写入失败（如磁盘权限问题），系统 SHALL 在结果中记录失败信息，但整体流程仍标记为成功
- UI 导出结果 SHALL 包含在 `DraftReconcileResult` 和 `PublishResult` 的返回值中

结果结构扩展：
```typescript
// DraftReconcileResult 新增字段
ui?: { exported: boolean };

// PublishResult 新增字段
ui?: { exported: boolean };
```

#### Scenario: UI 导出成功时的结果

- **WHEN** Draft Reconcile 执行成功，且 `ui/pages.json` 导出成功
- **THEN** 返回结果 SHALL 包含 `ui: { exported: true }`

#### Scenario: UI 导出失败但 Reconcile 继续

- **WHEN** Draft Reconcile 时 UI 文件写入磁盘失败
- **THEN** 系统 SHALL 继续完成 migration、seed、function 步骤，返回结果中 SHALL 包含 `ui: { exported: false }`，整体 `success` 仍为 `true`

#### Scenario: 无 UI 定义时的结果

- **WHEN** `app_files` 中不存在该 App 的 `ui/pages.json`
- **THEN** 返回结果 SHALL 不包含 `ui` 字段（为 `undefined`）

### Requirement: Draft/Stable UI 读取 API

系统 SHALL 提供 HTTP 端点，从 Draft 或 Stable 文件系统读取已 reconcile 的 UI 定义。

端点定义：
- `GET /draft/apps/:appName/ui` — 读取 `draft/apps/{appName}/ui/pages.json`
- `GET /stable/apps/:appName/ui` — 读取 `data/apps/{appName}/ui/pages.json`

响应格式：
- 成功：`{ "data": <parsed JSON content of pages.json> }`（Content-Type: application/json）
- 文件不存在：`404 { "error": "UI definition not found" }`

这些端点 SHALL 遵循现有的 Draft/Stable 路由中间件规则（App 状态校验、deleted App 返回 404 等）。

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

### Requirement: Publish 时清理 Draft UI 文件

系统 SHALL 在 Publish 成功后清理 Draft 环境中的 UI 文件。

Publisher 在清理 Draft 数据库（`resetDraft`）的同时，SHALL 也清理 `draft/apps/{appName}/ui/` 目录。此操作为 best-effort，清理失败不影响 Publish 结果。

#### Scenario: Publish 后清理 Draft UI

- **WHEN** Publish 成功完成
- **THEN** 系统 SHALL 删除 `draft/apps/{appName}/ui/pages.json`（若存在），清理失败不报错

#### Scenario: Publish 失败不清理

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 不清理 Draft UI 文件（保留用于调试）
