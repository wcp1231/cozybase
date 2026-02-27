# Function Runtime

## Purpose

Define the runtime model for user functions, including file conventions, route mapping, FunctionContext, module loading/cache strategy, and HTTP response behavior in stable/draft app modes.

## Requirements

### Requirement: 函数文件约定

系统 SHALL 支持在 Runtime 条目的 `functionsDir` 目录下通过 TypeScript 文件定义自定义业务逻辑（如 `data/apps/{appName}/functions/` 或 `draft/apps/{appName}/functions/`）。

文件约定：
- 文件名 MUST 匹配 `^[a-zA-Z0-9_-]+\.ts$`
- 以 `_` 开头的文件（如 `_middleware.ts`、`_utils.ts`）SHALL 不暴露为 API 端点（预留给内部用途）
- 文件名（不含 `.ts` 扩展名）直接映射为 API 路由中的 `:name` 参数
- `functions/` 目录不存在或为空时 SHALL 不报错

每个函数文件 SHALL 通过以下两种方式之一导出 handler：
1. **命名导出**：导出与 HTTP method 同名的 async 函数（`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`）
2. **默认导出**：`export default` 作为兜底 handler，处理所有未被命名导出覆盖的 HTTP method

Handler 解析优先级：
1. 精确匹配请求 method 的命名导出（如 `POST /stable/apps/my-app/fn/orders` → `orders.ts` 的 `POST` 导出）
2. `export default` 兜底
3. 两者都不存在 → 返回 `405 Method Not Allowed`

#### Scenario: 命名导出 handler

- **WHEN** `functions/orders.ts` 导出 `GET` 和 `POST` 两个命名函数，收到 `POST /stable/apps/my-app/fn/orders` 请求
- **THEN** 系统 SHALL 调用 `orders.ts` 的 `POST` 导出函数

#### Scenario: default 导出兜底

- **WHEN** `functions/notify.ts` 仅有 `export default`，收到 `POST /stable/apps/my-app/fn/notify` 请求
- **THEN** 系统 SHALL 调用 `notify.ts` 的 default 导出函数

#### Scenario: 混合导出 — 命名优先

- **WHEN** `functions/data.ts` 同时有 `GET` 命名导出和 `export default`，收到 `GET /stable/apps/my-app/fn/data` 请求
- **THEN** 系统 SHALL 调用 `GET` 命名导出，而非 default

#### Scenario: 混合导出 — default 兜底未覆盖的 method

- **WHEN** `functions/data.ts` 有 `GET` 命名导出和 `export default`，收到 `PUT /stable/apps/my-app/fn/data` 请求
- **THEN** 系统 SHALL 调用 `export default`（因为没有 `PUT` 命名导出）

#### Scenario: 无匹配 handler

- **WHEN** `functions/orders.ts` 仅导出 `GET`（无 default），收到 `POST /stable/apps/my-app/fn/orders` 请求
- **THEN** 系统 SHALL 返回 `405 Method Not Allowed`

#### Scenario: 下划线前缀文件不暴露

- **WHEN** `functions/_utils.ts` 存在，收到 `GET /stable/apps/my-app/fn/_utils` 请求
- **THEN** 系统 SHALL 返回 `404 Not Found`

#### Scenario: 函数文件不存在

- **WHEN** 收到 `GET /stable/apps/my-app/fn/nonexistent` 请求，但 `functions/nonexistent.ts` 不存在
- **THEN** 系统 SHALL 返回 `404 Not Found`

### Requirement: FunctionRuntime 接口移除

DirectRuntime 实现 SHALL 被移除，函数执行逻辑迁移到 `packages/runtime` 包中，由 Runtime 的 APP 注册表驱动。

#### Scenario: 函数执行由 Runtime 注册表驱动

- **WHEN** 函数执行请求到达 Runtime（如 `POST /stable/apps/todo/fn/create`）
- **THEN** Runtime 从注册表中查找 `todo:stable` 条目，使用其 `functionsDir` 加载函数模块并执行
- **THEN** 不再使用 DirectRuntime 类，Runtime 直接管理函数模块加载

### Requirement: 函数模块加载方式

函数模块加载 SHALL 基于 APP 注册表条目的 `functionsDir` 路径，而非通过 appResolver 中间件获取 APP 上下文。

#### Scenario: 函数文件定位
- **WHEN** Runtime 收到函数执行请求 `POST /{mode}/apps/todo/fn/create`
- **THEN** Runtime 从注册表的 `todo:{mode}` 条目获取 `functionsDir`，拼接为 `{functionsDir}/create.ts` 加载

#### Scenario: Draft 模式函数缓存
- **WHEN** Draft 模式下执行函数
- **THEN** Runtime 每次请求重新加载函数模块（使用 cache bust），确保代码变更立即生效

#### Scenario: Stable 模式函数缓存
- **WHEN** Stable 模式下执行函数
- **THEN** Runtime 使用 `moduleCache`（存储在注册表条目中）缓存已加载的函数模块
- **AND** 当 APP restart 时，缓存被清除并重新加载

### Requirement: FunctionContext 运行时上下文

FunctionContext SHALL 从 Runtime 的 APP 注册表条目获取 DB 连接和其他上下文信息，而非从 Daemon 的 AppContext 获取。

系统 SHALL 为每次函数调用构建 `FunctionContext` 对象，提供以下运行时能力：

- `req: Request` — 标准 Web Request 对象
- `db: DatabaseClient` — 注册表条目的数据库客户端（启动时由 Runtime 打开的 SQLite 连接）
- `env: Record<string, string>` — 环境变量（来源于 `process.env`）
- `app: { name: string }` — 当前 APP 信息（APP 名称和模式）
- `mode: 'stable' | 'draft'` — 当前运行模式
- `log: Logger` — 结构化日志工具
- `fetch: typeof globalThis.fetch` — HTTP 客户端
- `platform: PlatformClient` — 平台客户端，用于调用其他 APP 函数和 Daemon 服务

`PlatformClient` SHALL 提供以下方法：
- `call(target: string, path: string, options?: RequestInit): Promise<Response>` — 调用其他 APP 或 Daemon 服务

`DatabaseClient` SHALL 封装底层 SQLite 连接，提供以下方法：
- `query<T>(sql: string, params?: unknown[]): T[]` — 查询并返回结果数组
- `run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number }` — 执行写操作
- `exec(sql: string): void` — 执行裸 SQL（如多语句）

`Logger` SHALL 支持以下方法：
- `info(message: string, data?: Record<string, unknown>): void`
- `warn(message: string, data?: Record<string, unknown>): void`
- `error(message: string, data?: Record<string, unknown>): void`
- `debug(message: string, data?: Record<string, unknown>): void`

日志输出 SHALL 包含 APP 名称、函数名称和运行模式，便于 AI Agent 调试追踪。

#### Scenario: FunctionContext 构建

- **WHEN** Runtime 准备执行函数
- **THEN** 从注册表条目构建 FunctionContext，包括 `req`（原始请求）、`db`（注册表条目的 DB 连接）、`env`（环境变量）、`app`（APP 名称和模式）、`mode`（stable/draft）、`log`（Logger 实例）、`platform`（PlatformClient 实例）

#### Scenario: 函数访问数据库

- **WHEN** Draft 模式下函数调用 `ctx.db.query('SELECT * FROM todos')`
- **THEN** 系统 SHALL 从 `draft/apps/{appName}/db.sqlite` 查询数据并返回结果数组

#### Scenario: DatabaseClient 使用注册表 DB 连接

- **WHEN** 函数通过 `ctx.db.query()` 执行数据库查询
- **THEN** DatabaseClient 使用注册表条目中的 `db` 连接（启动时由 Runtime 打开的 SQLite 连接）

#### Scenario: 函数访问数据库 — Stable 模式

- **WHEN** Stable 模式下函数调用 `ctx.db.run('INSERT INTO todos ...')`
- **THEN** 系统 SHALL 在 `data/apps/{appName}/db.sqlite` 上执行写操作

#### Scenario: 函数使用日志

- **WHEN** 函数调用 `ctx.log.info('Order created', { orderId: 123 })`
- **THEN** 系统 SHALL 输出包含 APP 名称、函数名称、运行模式和日志内容的结构化日志

#### Scenario: 函数使用 fetch

- **WHEN** 函数调用 `ctx.fetch('https://api.example.com/data')`
- **THEN** 系统 SHALL 执行 HTTP 请求并返回标准 Response 对象

#### Scenario: 函数通过 platform 调用其他 APP
- **WHEN** 函数调用 `ctx.platform.call('other-app', 'get-data')`
- **THEN** PlatformClient SHALL 将请求路由到 `other-app` 的 `get-data` 函数并返回结果

#### Scenario: 函数通过 platform 访问其他 APP 的 auto CRUD
- **WHEN** 函数调用 `ctx.platform.call('other-app', '_db/tables/users')`
- **THEN** PlatformClient SHALL 将请求路由到 `other-app` 的 auto CRUD 路由并返回用户列表

### Requirement: 函数 HTTP 路由注册

函数路由 SHALL 从 `packages/server` 迁移到 `packages/runtime`，对外路径为 `/{mode}/apps/:name/fn/:fnName`（`{mode}` 为 `stable` 或 `draft`）。

系统 SHALL 注册以下路由用于调用用户自定义函数：

- `/stable/apps/:appName/fn/:name` — Stable 版本的函数调用
- `/draft/apps/:appName/fn/:name` — Draft 版本的函数调用

路由 SHALL 接受所有 HTTP 方法（GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS），由函数文件的导出决定哪些方法被处理。

路由 SHALL 使用 Runtime 注册表查找替代原有的 `appResolver` 中间件，通过 URL 中的 `:name` 参数和请求路径中的 mode 前缀定位 APP 条目。

#### Scenario: 调用 Stable 函数

- **WHEN** 发送 `POST /stable/apps/my-app/fn/create-order`
- **THEN** 请求经 Daemon mount 到达 Runtime，Runtime 在 `/{mode}/apps/:name/fn/:fnName` 路由中处理
- **THEN** 路由支持所有 HTTP 方法（GET、POST、PUT、PATCH、DELETE 等）

#### Scenario: 调用 Draft 函数

- **WHEN** 发送 `POST /draft/apps/my-app/fn/create-order`
- **THEN** 系统 SHALL 加载 `draft/apps/my-app/functions/create-order.ts`，以 Draft 模式执行，使用 Draft 数据库

#### Scenario: appResolver 中间件替换

- **WHEN** 函数请求到达 Runtime
- **THEN** Runtime 使用注册表查找替代原有的 appResolver 中间件，通过 URL 中的 `:name` 参数和请求路径中的 mode 前缀定位 APP 条目

#### Scenario: 访问不存在的 Stable 函数（App 为 Draft only）

- **WHEN** 发送 `GET /stable/apps/new-app/fn/health`，但 `new-app` 处于 Draft only 状态
- **THEN** 系统 SHALL 返回 `404 Not Found`（由注册表查找拦截）

### Requirement: 函数返回值处理

系统 SHALL 根据函数 handler 的返回值类型自动构建 HTTP Response：

- 返回 `Response` 对象 → 直接透传
- 返回普通对象或数组 → 自动序列化为 JSON，状态码 `200`，Content-Type 为 `application/json`
- 返回 `null` 或 `undefined` → 状态码 `204 No Content`
- 抛出 `AppError` 子类异常 → 按其 `statusCode` 和 `message` 返回错误响应
- 抛出普通 `Error` → 状态码 `500 Internal Server Error`

#### Scenario: 返回对象自动 JSON 序列化

- **WHEN** 函数 handler 返回 `{ id: 1, name: 'test' }`
- **THEN** 系统 SHALL 返回 HTTP 200，body 为 `{"id":1,"name":"test"}`，Content-Type 为 `application/json`

#### Scenario: 返回 Response 对象透传

- **WHEN** 函数 handler 返回 `new Response('hello', { status: 201 })`
- **THEN** 系统 SHALL 直接透传该 Response，不做额外处理

#### Scenario: 返回 null

- **WHEN** 函数 handler 返回 `null`
- **THEN** 系统 SHALL 返回 HTTP 204 No Content

#### Scenario: 函数抛出异常

- **WHEN** 函数 handler 抛出 `new BadRequestError('Invalid input')`
- **THEN** 系统 SHALL 返回 HTTP 400，body 包含错误信息

#### Scenario: 函数加载失败

- **WHEN** 函数文件存在语法错误，导致 `import()` 失败
- **THEN** 系统 SHALL 返回 HTTP 500，Draft 模式下 SHALL 包含详细错误堆栈信息
