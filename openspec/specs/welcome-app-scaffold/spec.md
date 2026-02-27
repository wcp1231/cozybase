# Welcome App Scaffold

## Purpose

Welcome 应用模板（TODO App），作为 workspace 初始化时的示例应用提供给用户。包含完整的数据库 migration、seed 数据和 CRUD API functions。

## Requirements

### Requirement: Welcome 应用模板目录结构

系统 SHALL 在 `packages/daemon/templates/welcome/` 目录下维护 Welcome 应用模板，目录结构与实际 app 目录完全一致：

```
templates/welcome/
├── app.yaml
├── migrations/
│   └── 001_init.sql
├── seeds/
│   └── todos.sql
└── functions/
    └── todos.ts
```

- `app.yaml` SHALL 包含应用描述：`description: "Welcome - TODO App"`
- 模板文件 SHALL 作为真实文件维护（非硬编码字符串），确保可获得语法高亮和编辑器支持

#### Scenario: 模板目录完整性

- **WHEN** 开发者检查 `packages/daemon/templates/welcome/` 目录
- **THEN** 目录下 SHALL 包含 `app.yaml`、`migrations/001_init.sql`、`seeds/todos.sql` 和 `functions/todos.ts` 四个文件

### Requirement: TODO 表 Migration

`migrations/001_init.sql` SHALL 创建如下 `todo` 表：

```sql
CREATE TABLE todo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

字段说明：
- `id` — 自增主键
- `title` — 待办事项标题，不可为空
- `completed` — 完成状态，`0` 表示未完成，`1` 表示已完成
- `created_at` — 创建时间，自动填充

#### Scenario: Migration 执行成功

- **WHEN** 系统对 Welcome 应用执行 Draft Reconcile
- **THEN** Draft 数据库中 SHALL 存在 `todo` 表，包含 `id`、`title`、`completed`、`created_at` 四个字段

#### Scenario: Migration 幂等性

- **WHEN** `001_init.sql` 被重复执行（通过 Reconcile 重建）
- **THEN** SHALL 不产生错误，表结构保持一致

### Requirement: Seed 数据

`seeds/todos.sql` SHALL 预置示例待办事项数据，用于演示目的。

Seed 数据 SHALL 包含至少 3 条记录，覆盖已完成和未完成两种状态。

#### Scenario: Seed 数据加载

- **WHEN** 系统对 Welcome 应用执行 Draft Reconcile 且 seed 文件存在
- **THEN** `todo` 表中 SHALL 包含预置的示例数据，且 `completed` 字段同时包含 `0` 和 `1` 两种值

### Requirement: Todos Function — 查询待办事项

`functions/todos.ts` SHALL 导出 `GET` 函数，用于查询待办事项列表。

行为规范：
- 不带参数时 SHALL 返回所有待办事项
- 支持 `?status=completed` 查询参数，仅返回 `completed = 1` 的记录
- 支持 `?status=pending` 查询参数，仅返回 `completed = 0` 的记录
- 返回值 SHALL 为待办事项数组

#### Scenario: 查询所有待办事项

- **WHEN** 客户端发送 `GET /draft/apps/welcome/fn/todos`
- **THEN** 系统 SHALL 返回 `todo` 表中的所有记录

#### Scenario: 按状态筛选 — 已完成

- **WHEN** 客户端发送 `GET /draft/apps/welcome/fn/todos?status=completed`
- **THEN** 系统 SHALL 仅返回 `completed = 1` 的记录

#### Scenario: 按状态筛选 — 未完成

- **WHEN** 客户端发送 `GET /draft/apps/welcome/fn/todos?status=pending`
- **THEN** 系统 SHALL 仅返回 `completed = 0` 的记录

### Requirement: Todos Function — 添加待办事项

`functions/todos.ts` SHALL 导出 `POST` 函数，用于创建新的待办事项。

行为规范：
- Request body SHALL 为 JSON 格式：`{ "title": "string" }`
- `title` 字段为必填，缺失或为空时 SHALL 返回错误
- 创建成功后 SHALL 返回新创建的待办事项记录（含 `id` 和 `created_at`）

#### Scenario: 成功添加待办事项

- **WHEN** 客户端发送 `POST /draft/apps/welcome/fn/todos`，body 为 `{ "title": "买牛奶" }`
- **THEN** 系统 SHALL 在 `todo` 表中插入一条新记录，并返回包含 `id`、`title`、`completed`、`created_at` 的完整记录

#### Scenario: 缺少 title 字段

- **WHEN** 客户端发送 `POST /draft/apps/welcome/fn/todos`，body 为 `{}` 或 `{ "title": "" }`
- **THEN** 系统 SHALL 返回 400 错误，说明 title 为必填字段

### Requirement: Todos Function — 删除待办事项

`functions/todos.ts` SHALL 导出 `DELETE` 函数，用于删除指定的待办事项。

行为规范：
- Request body SHALL 为 JSON 格式：`{ "id": number }`
- `id` 字段为必填，缺失时 SHALL 返回错误
- 删除成功后 SHALL 返回确认信息
- 指定 `id` 不存在时 SHALL 返回 404 错误

#### Scenario: 成功删除待办事项

- **WHEN** 客户端发送 `DELETE /draft/apps/welcome/fn/todos`，body 为 `{ "id": 1 }`，且 `id=1` 的记录存在
- **THEN** 系统 SHALL 从 `todo` 表中删除该记录，并返回删除成功的确认信息

#### Scenario: 删除不存在的记录

- **WHEN** 客户端发送 `DELETE /draft/apps/welcome/fn/todos`，body 为 `{ "id": 999 }`，且该记录不存在
- **THEN** 系统 SHALL 返回 404 错误

#### Scenario: 缺少 id 字段

- **WHEN** 客户端发送 `DELETE /draft/apps/welcome/fn/todos`，body 为 `{}`
- **THEN** 系统 SHALL 返回 400 错误，说明 id 为必填字段
