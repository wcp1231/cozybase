## MODIFIED Requirements

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
