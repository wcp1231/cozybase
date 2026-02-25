## Requirements

### Requirement: 函数文件约定

系统 SHALL 支持在 `apps/{appName}/functions/` 目录下通过 TypeScript 文件定义自定义业务逻辑。

文件约定：
- 文件名 MUST 匹配 `^[a-zA-Z0-9_-]+\.ts$`
- 以 `_` 开头的文件（如 `_middleware.ts`、`_utils.ts`）SHALL 不暴露为 API 端点（预留给内部用途）
- 文件名（不含 `.ts` 扩展名）直接映射为 API 路由中的 `:name` 参数
- `functions/` 目录不存在或为空时 SHALL 不报错

每个函数文件 SHALL 通过以下两种方式之一导出 handler：
1. **命名导出**：导出与 HTTP method 同名的 async 函数（`GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`）
2. **默认导出**：`export default` 作为兜底 handler，处理所有未被命名导出覆盖的 HTTP method

Handler 解析优先级：
1. 精确匹配请求 method 的命名导出（如 `POST /functions/orders` → `orders.ts` 的 `POST` 导出）
2. `export default` 兜底
3. 两者都不存在 → 返回 `405 Method Not Allowed`

#### Scenario: 命名导出 handler

- **WHEN** `functions/orders.ts` 导出 `GET` 和 `POST` 两个命名函数，收到 `POST /functions/orders` 请求
- **THEN** 系统 SHALL 调用 `orders.ts` 的 `POST` 导出函数

#### Scenario: default 导出兜底

- **WHEN** `functions/notify.ts` 仅有 `export default`，收到 `POST /functions/notify` 请求
- **THEN** 系统 SHALL 调用 `notify.ts` 的 default 导出函数

#### Scenario: 混合导出 — 命名优先

- **WHEN** `functions/data.ts` 同时有 `GET` 命名导出和 `export default`，收到 `GET /functions/data` 请求
- **THEN** 系统 SHALL 调用 `GET` 命名导出，而非 default

#### Scenario: 混合导出 — default 兜底未覆盖的 method

- **WHEN** `functions/data.ts` 有 `GET` 命名导出和 `export default`，收到 `PUT /functions/data` 请求
- **THEN** 系统 SHALL 调用 `export default`（因为没有 `PUT` 命名导出）

#### Scenario: 无匹配 handler

- **WHEN** `functions/orders.ts` 仅导出 `GET`（无 default），收到 `POST /functions/orders` 请求
- **THEN** 系统 SHALL 返回 `405 Method Not Allowed`

#### Scenario: 下划线前缀文件不暴露

- **WHEN** `functions/_utils.ts` 存在，收到 `GET /functions/_utils` 请求
- **THEN** 系统 SHALL 返回 `404 Not Found`

#### Scenario: 函数文件不存在

- **WHEN** 收到 `GET /functions/nonexistent` 请求，但 `functions/nonexistent.ts` 不存在
- **THEN** 系统 SHALL 返回 `404 Not Found`

### Requirement: FunctionRuntime 接口抽象

系统 SHALL 通过 `FunctionRuntime` 接口抽象函数的加载与执行，使执行环境可替换。

`FunctionRuntime` 接口 SHALL 包含以下方法：
- `execute(app: AppContext, functionName: string, request: Request): Promise<Response>` — 执行指定函数
- `reload(appName: string): Promise<void>` — 重新加载指定 APP 的所有函数模块缓存
- `shutdown(): Promise<void>` — 关闭运行时，释放所有资源

系统 SHALL 在启动时初始化一个 `FunctionRuntime` 实例，并在所有函数路由中共享使用。

#### Scenario: 通过接口执行函数

- **WHEN** 函数路由收到请求
- **THEN** 系统 SHALL 调用 `FunctionRuntime.execute()` 处理请求，而非直接 `import()` 函数文件

#### Scenario: 运行时关闭

- **WHEN** 服务器关闭时
- **THEN** 系统 SHALL 调用 `FunctionRuntime.shutdown()` 释放资源

### Requirement: DirectRuntime 实现

系统 SHALL 提供 `DirectRuntime` 作为 `FunctionRuntime` 的 MVP 实现，在主进程内通过 Bun 的 `import()` 动态加载并执行 TypeScript 函数文件。

加载与缓存策略：
- **Draft 模式**：每次请求 SHALL 重新 `import()` 函数文件（通过 query string cache bust 绕过模块缓存），实现热重载
- **Stable 模式**：首次 `import()` 后 SHALL 缓存模块引用，后续请求复用缓存。调用 `reload()` SHALL 清除指定 APP 的模块缓存

#### Scenario: Draft 模式热重载

- **WHEN** Draft 模式下连续两次请求同一函数，且两次请求之间函数文件内容发生变化
- **THEN** 系统 SHALL 加载最新版本的函数文件，两次请求 SHALL 执行不同版本的代码

#### Scenario: Stable 模式缓存

- **WHEN** Stable 模式下连续两次请求同一函数
- **THEN** 系统 SHALL 复用首次加载的模块，不重新 `import()`

#### Scenario: reload 清除缓存

- **WHEN** 调用 `reload('my-app')` 后再次请求 `my-app` 的某个 Stable 函数
- **THEN** 系统 SHALL 重新 `import()` 该函数文件

### Requirement: FunctionContext 运行时上下文

系统 SHALL 为每次函数调用构建 `FunctionContext` 对象，提供以下运行时能力：

- `req: Request` — 标准 Web Request 对象
- `db: DatabaseClient` — 当前模式（Stable 或 Draft）的数据库客户端
- `env: Record<string, string>` — 环境变量（来源于 `process.env`）
- `app: { name: string }` — 当前 APP 信息
- `mode: 'stable' | 'draft'` — 当前运行模式
- `log: Logger` — 结构化日志工具
- `fetch: typeof globalThis.fetch` — HTTP 客户端

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

#### Scenario: 函数访问数据库

- **WHEN** Draft 模式下函数调用 `ctx.db.query('SELECT * FROM todos')`
- **THEN** 系统 SHALL 从 `draft/apps/{appName}/db.sqlite` 查询数据并返回结果数组

#### Scenario: 函数访问数据库 — Stable 模式

- **WHEN** Stable 模式下函数调用 `ctx.db.run('INSERT INTO todos ...')`
- **THEN** 系统 SHALL 在 `data/apps/{appName}/db.sqlite` 上执行写操作

#### Scenario: 函数使用日志

- **WHEN** 函数调用 `ctx.log.info('Order created', { orderId: 123 })`
- **THEN** 系统 SHALL 输出包含 APP 名称、函数名称、运行模式和日志内容的结构化日志

#### Scenario: 函数使用 fetch

- **WHEN** 函数调用 `ctx.fetch('https://api.example.com/data')`
- **THEN** 系统 SHALL 执行 HTTP 请求并返回标准 Response 对象

### Requirement: 函数 HTTP 路由注册

系统 SHALL 注册以下路由用于调用用户自定义函数：

- `/stable/apps/:appName/functions/:name` — Stable 版本的函数调用
- `/draft/apps/:appName/functions/:name` — Draft 版本的函数调用

路由 SHALL 接受所有 HTTP 方法（GET、POST、PUT、PATCH、DELETE、HEAD、OPTIONS），由函数文件的导出决定哪些方法被处理。

路由 SHALL 复用现有的 `appResolver` 中间件获取 `AppContext` 和运行模式。

#### Scenario: 调用 Stable 函数

- **WHEN** 发送 `POST /stable/apps/my-app/functions/create-order`
- **THEN** 系统 SHALL 加载 `apps/my-app/functions/create-order.ts`，以 Stable 模式执行，使用 Stable 数据库

#### Scenario: 调用 Draft 函数

- **WHEN** 发送 `POST /draft/apps/my-app/functions/create-order`
- **THEN** 系统 SHALL 加载 `apps/my-app/functions/create-order.ts`，以 Draft 模式执行，使用 Draft 数据库

#### Scenario: 访问不存在的 Stable 函数（App 为 Draft only）

- **WHEN** 发送 `GET /stable/apps/new-app/functions/health`，但 `new-app` 处于 Draft only 状态
- **THEN** 系统 SHALL 返回 `404 Not Found`（由 `appResolver` 拦截）

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
