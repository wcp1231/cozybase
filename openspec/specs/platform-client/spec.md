# Platform Client

## Purpose

Provide a unified runtime-level client for APP-to-APP calls and Daemon platform service calls, including in-process routing, loop protection, and auto CRUD access under the function namespace.

## Requirements

### Requirement: PlatformClient 接口

Runtime SHALL 提供 `PlatformClient` 接口，作为 APP 间调用和 Daemon 服务调用的统一通道。

```typescript
interface PlatformClient {
  call(target: string, path: string, options?: RequestInit): Promise<Response>;
}
```

- `target` 参数 SHALL 支持以下取值：
  - 普通 APP 名称（如 `'todos'`）→ 路由到该 APP 的 `/fn/` 路由
  - `'_platform'` → 路由到 Daemon 内部服务
- `path` 参数 SHALL 映射为目标 APP 的 `/fn/{path}` 路由路径
- `options` 参数 SHALL 遵循标准 `RequestInit` 接口（method、headers、body 等）
- 未提供 `options` 时 SHALL 默认使用 `GET` 方法

#### Scenario: 调用其他 APP 的手写函数
- **WHEN** APP A 的函数执行 `ctx.platform.call('todos', 'stats')`
- **THEN** PlatformClient SHALL 将请求路由到 `todos` APP 的 `/fn/stats` 路由
- **AND** 返回标准 `Response` 对象

#### Scenario: 调用其他 APP 的 auto CRUD
- **WHEN** APP A 的函数执行 `ctx.platform.call('todos', '_db/tables/tasks')`
- **THEN** PlatformClient SHALL 将请求路由到 `todos` APP 的 `/fn/_db/tables/tasks` 路由
- **AND** 返回包含 tasks 表数据的 `Response` 对象

#### Scenario: 调用 Daemon 平台服务
- **WHEN** Runtime 中间件执行 `platformClient.call('_platform', 'auth/verify', { method: 'POST' })`
- **THEN** PlatformClient SHALL 将请求路由到 Daemon 的 `_platform` 处理器
- **AND** 返回认证结果的 `Response` 对象

#### Scenario: 调用不存在的 APP
- **WHEN** 函数执行 `ctx.platform.call('nonexistent', 'stats')`
- **THEN** PlatformClient SHALL 返回 HTTP 404 Response

#### Scenario: 调用默认方法
- **WHEN** 函数执行 `ctx.platform.call('todos', 'stats')` 且不提供 `options`
- **THEN** PlatformClient SHALL 以 `GET` 方法发起请求

#### Scenario: 传递请求体
- **WHEN** 函数执行 `ctx.platform.call('todos', '_db/tables/tasks', { method: 'POST', body: JSON.stringify({ title: 'New' }), headers: { 'Content-Type': 'application/json' } })`
- **THEN** PlatformClient SHALL 将请求体传递给目标 APP 的路由处理器

### Requirement: PlatformClient 同进程实现

当 Runtime 和 Daemon 在同一进程中运行时，PlatformClient SHALL 通过 Hono `app.request()` 执行内部调用，不走实际网络。

Runtime SHALL 提供 `createInProcessPlatformClient()` 工厂函数：

```typescript
function createInProcessPlatformClient(
  runtimeApp: Hono,
  platformHandler: PlatformHandler,
  mode: AppMode,
): PlatformClient
```

- APP 间调用 SHALL 通过 `runtimeApp.request()` 路由到目标 APP
- `_platform` 调用 SHALL 通过 `platformHandler.handle()` 路由到 Daemon 服务

#### Scenario: APP 间调用走 Runtime 内部路由
- **WHEN** PlatformClient 处理 `call('todos', 'stats')` 且当前 mode 为 `stable`
- **THEN** SHALL 构造 Request 并通过 `runtimeApp.request('/stable/apps/todos/fn/stats')` 执行
- **AND** 不产生任何网络请求

#### Scenario: 平台调用走 PlatformHandler
- **WHEN** PlatformClient 处理 `call('_platform', 'auth/verify', ...)`
- **THEN** SHALL 通过 `platformHandler.handle('auth/verify', request)` 执行
- **AND** 不直接依赖 Daemon 的 Hono app 引用

### Requirement: PlatformHandler 接口

Runtime SHALL 定义 `PlatformHandler` 接口，由 Daemon 提供实现，用于处理 `_platform` 命名空间的调用。

```typescript
interface PlatformHandler {
  handle(path: string, request: Request): Promise<Response>;
}
```

Daemon SHALL 提供同进程实现，通过 Daemon 的 Hono app 内部路由处理请求。

#### Scenario: Daemon 提供 PlatformHandler 实现
- **WHEN** Daemon 创建 Runtime 时
- **THEN** Daemon SHALL 提供 `PlatformHandler` 实现，将 `_platform` 路径映射到 Daemon 内部路由（如 `/internal/auth/verify`、`/api/v1/theme/css`）

#### Scenario: PlatformHandler 处理认证验证
- **WHEN** `platformHandler.handle('auth/verify', request)` 被调用
- **THEN** Daemon 的 PlatformHandler SHALL 将请求路由到 `/internal/auth/verify` 端点并返回结果

#### Scenario: PlatformHandler 处理主题 CSS
- **WHEN** `platformHandler.handle('theme/css', request)` 被调用
- **THEN** Daemon 的 PlatformHandler SHALL 返回当前主题 CSS 内容

### Requirement: 内部调用免认证

PlatformClient 发起的调用 SHALL 视为系统可信调用，不经过外部认证中间件。

#### Scenario: 内部调用不触发认证
- **WHEN** APP A 通过 `ctx.platform.call('todos', 'stats')` 调用 APP B
- **THEN** 该调用 SHALL 不经过外部认证中间件
- **AND** 目标 APP 的函数 SHALL 正常执行并返回结果

#### Scenario: 外部请求仍受认证保护
- **WHEN** 外部客户端直接通过 HTTP 访问 `GET /stable/apps/todos/fn/stats`
- **THEN** 请求 SHALL 经过正常的认证中间件流程

### Requirement: 循环调用保护

PlatformClient SHALL 实现调用深度限制，防止 APP 间循环调用导致无限递归。

- PlatformClient 发起请求时 SHALL 在请求中附带自定义 header `X-Platform-Call-Depth`
- 每次内部调用 SHALL 将 depth 值加 1
- 当 depth 超过阈值（默认 10）时 SHALL 拒绝调用并返回 HTTP 508 Loop Detected

#### Scenario: 正常调用链
- **WHEN** APP A 调用 APP B，APP B 调用 APP C（depth=2）
- **THEN** 所有调用 SHALL 正常执行

#### Scenario: 循环调用被拦截
- **WHEN** APP A 调用 APP B，APP B 调用 APP A，如此循环直到 depth 超过 10
- **THEN** PlatformClient SHALL 返回 HTTP 508 Loop Detected
- **AND** Response body SHALL 包含错误信息说明调用深度超限

#### Scenario: 外部请求无 depth header
- **WHEN** 外部请求到达且没有 `X-Platform-Call-Depth` header
- **THEN** PlatformClient 构建的内部调用 SHALL 从 depth=1 开始计数

### Requirement: Auto CRUD 路由

Runtime SHALL 为每个 APP 自动生成数据库 CRUD 路由，挂载在 `/fn/_db/` 路径下。

路由结构：
- `GET /{mode}/apps/:name/fn/_db/schemas` — 数据库 schema 内省
- `POST /{mode}/apps/:name/fn/_db/sql` — raw SQL 执行
- `GET /{mode}/apps/:name/fn/_db/tables/:table` — 列表查询（支持 filter/sort/paginate）
- `POST /{mode}/apps/:name/fn/_db/tables/:table` — 创建记录
- `GET /{mode}/apps/:name/fn/_db/tables/:table/:id` — 获取单条记录
- `PATCH /{mode}/apps/:name/fn/_db/tables/:table/:id` — 更新记录
- `DELETE /{mode}/apps/:name/fn/_db/tables/:table/:id` — 删除记录

Auto CRUD 路由 SHALL 在函数路由模块中优先于 `:fnName` 通配路由注册，使 `_db/*` 路径被正确匹配。

#### Scenario: 列表查询
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/tables/tasks?limit=10&offset=0`
- **THEN** Runtime SHALL 查询 `todo:stable` 的 tasks 表，返回最多 10 条记录及 meta 信息（total、limit、offset）

#### Scenario: 创建记录
- **WHEN** 客户端发送 `POST /stable/apps/todo/fn/_db/tables/tasks`，body 为 `{ "title": "New Task" }`
- **THEN** Runtime SHALL 在 tasks 表中插入一条记录并返回 HTTP 201 和创建的记录

#### Scenario: 获取单条记录
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/tables/tasks/abc123`
- **THEN** Runtime SHALL 根据主键查询并返回该记录
- **AND** 如果记录不存在 SHALL 返回 HTTP 404

#### Scenario: 更新记录
- **WHEN** 客户端发送 `PATCH /stable/apps/todo/fn/_db/tables/tasks/abc123`，body 为 `{ "done": true }`
- **THEN** Runtime SHALL 更新对应记录的 `done` 字段并返回更新后的完整记录

#### Scenario: 删除记录
- **WHEN** 客户端发送 `DELETE /stable/apps/todo/fn/_db/tables/tasks/abc123`
- **THEN** Runtime SHALL 删除该记录并返回 `{ success: true }`

#### Scenario: Schema 内省
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/schemas`
- **THEN** Runtime SHALL 返回该 APP 数据库的完整 schema 信息（表名、列定义、索引等）

#### Scenario: Raw SQL 执行
- **WHEN** 客户端发送 `POST /stable/apps/todo/fn/_db/sql`，body 为 `{ "sql": "SELECT count(*) FROM tasks" }`
- **THEN** Runtime SHALL 执行该 SQL 并返回结果

#### Scenario: 拒绝访问内部表
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/tables/_migrations`
- **THEN** Runtime SHALL 返回 HTTP 400，拒绝访问以 `_` 或 `sqlite_` 开头的表

#### Scenario: 表不存在
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/tables/nonexistent`
- **THEN** Runtime SHALL 返回 HTTP 404

#### Scenario: PlatformClient 通过 auto CRUD 获取数据
- **WHEN** Dashboard APP 执行 `ctx.platform.call('todos', '_db/tables/tasks?limit=5')`
- **THEN** PlatformClient SHALL 将请求路由到 todos APP 的 auto CRUD 路由
- **AND** 返回包含最多 5 条 tasks 记录的 Response

### Requirement: _platform 命名空间保留

`_platform` SHALL 作为 PlatformClient 的保留 target 名称，用于路由到 Daemon 内部服务。

- Daemon SHALL 在创建 APP 时拒绝以 `_` 开头的 APP 名称
- `_platform` target 的请求 SHALL 通过 PlatformHandler 路由，而非 Runtime 的 APP 路由

#### Scenario: 拒绝创建 _ 前缀的 APP
- **WHEN** 用户尝试创建名为 `_platform` 或 `_system` 的 APP
- **THEN** Daemon SHALL 返回错误，拒绝创建

#### Scenario: _platform 调用不走 APP 路由
- **WHEN** PlatformClient 处理 `call('_platform', 'theme/css')`
- **THEN** SHALL 通过 PlatformHandler 处理，不在 AppRegistry 中查找名为 `_platform` 的 APP

### Requirement: 前端聊天 store 必须按 activeApp 切换 Agent 连接

前端聊天 store SHALL 暴露 `activeApp` 状态和 `setActiveApp(appName | null)` 操作。`setActiveApp` 在 APP 变化时 SHALL 断开旧 WebSocket、清空本地消息，并根据新的 APP 重新建立或停止连接。

#### Scenario: 切换到新的 APP 时重建连接

- **WHEN** 当前聊天 store 已连接 APP `orders`
- **AND** 页面切换并调用 `setActiveApp('inventory')`
- **THEN** store SHALL 先断开 `orders` 的 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store SHALL 建立新的 `/api/v1/chat/ws?app=inventory` 连接

#### Scenario: activeApp 变为 null 时停止聊天连接

- **WHEN** 页面进入 Home 模式或 Builder 列表页并调用 `setActiveApp(null)`
- **THEN** store SHALL 断开当前 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store MUST NOT 自动建立新的 chat WebSocket 连接

### Requirement: 前端必须处理按 APP 恢复的历史消息

前端聊天 store SHALL 识别 `chat:history` 消息，并使用服务端返回的历史消息初始化当前 APP 的聊天记录。

#### Scenario: 建立连接后恢复历史记录

- **WHEN** 前端收到某个 APP 的 `chat:history` 消息
- **THEN** store SHALL 用 `chat:history.messages` 初始化当前消息列表
- **AND** 后续新的 assistant 或 tool 消息 SHALL 追加到该列表之后

### Requirement: ChatPanel 必须根据页面上下文展示三态 UI

ChatPanel SHALL 按页面上下文区分 Home 模式、Builder 列表页和 Builder APP 页三种展示状态。

#### Scenario: Home 模式显示占位 UI

- **WHEN** 当前页面处于 Home 模式
- **THEN** ChatPanel SHALL 显示占位 UI 框架
- **AND** ChatPanel MUST NOT 建立可发送消息的 APP chat 会话

#### Scenario: Builder 列表页提示先选择 APP

- **WHEN** 当前页面处于 Builder 模式且尚未选中具体 APP
- **THEN** ChatPanel SHALL 显示“请先选择应用”一类的提示信息
- **AND** ChatPanel MUST NOT 发送聊天消息到后端

#### Scenario: Builder APP 页启用正常聊天

- **WHEN** 当前页面处于 Builder 模式且已选中 APP `orders`
- **THEN** ChatPanel SHALL 显示 `orders` 的聊天历史和输入框
- **AND** 用户发送的消息 SHALL 通过 `orders` 对应的 chat WebSocket 发送到后端

### Requirement: AppLayout 必须同步路由上下文到 activeApp

前端页面布局层 SHALL 监听当前路由的 `mode` 和 `appName`，并据此同步聊天 store 的 `activeApp`。

#### Scenario: 进入 Builder APP 页时设置 activeApp

- **WHEN** 用户进入 Builder 模式下的 APP 页面 `/draft/apps/orders/...`
- **THEN** AppLayout SHALL 调用 `setActiveApp('orders')`
- **AND** 聊天 store SHALL 连接到 `orders` 的 chat WebSocket

#### Scenario: 离开 Builder APP 页时清空 activeApp

- **WHEN** 用户从 Builder APP 页返回 Builder 列表页或切换到 Home 模式
- **THEN** AppLayout SHALL 调用 `setActiveApp(null)`
- **AND** 聊天 store SHALL 停止当前 APP 的 chat 连接
