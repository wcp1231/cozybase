## MODIFIED Requirements

### Requirement: FunctionRuntime 接口移除

DirectRuntime 实现 SHALL 被移除，函数执行逻辑迁移到 `packages/runtime` 包中，由 Runtime 的 APP 注册表驱动。

#### Scenario: 函数执行由 Runtime 注册表驱动
- **WHEN** 函数执行请求到达 Runtime（如 `POST /stable/apps/todo/fn/create`）
- **THEN** Runtime 从注册表中查找 `todo:stable` 条目，使用其 `functionsDir` 加载函数模块并执行
- **THEN** 不再使用 DirectRuntime 类，Runtime 直接管理函数模块加载

### Requirement: 函数模块加载方式变更

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

### Requirement: FunctionContext 适配

FunctionContext SHALL 从 Runtime 的 APP 注册表条目获取 DB 连接和其他上下文信息，而非从 Daemon 的 AppContext 获取。

#### Scenario: FunctionContext 构建
- **WHEN** Runtime 准备执行函数
- **THEN** 从注册表条目构建 FunctionContext，包括 `req`（原始请求）、`db`（注册表条目的 DB 连接）、`env`（环境变量）、`app`（APP 名称和模式）、`mode`（stable/draft）、`log`（Logger 实例）

#### Scenario: DatabaseClient 使用注册表 DB 连接
- **WHEN** 函数通过 `ctx.db.query()` 执行数据库查询
- **THEN** DatabaseClient 使用注册表条目中的 `db` 连接（启动时由 Runtime 打开的 SQLite 连接）

### Requirement: 函数 HTTP 路由迁移

函数路由 SHALL 从 `packages/server` 迁移到 `packages/runtime`，对外路径为 `/{mode}/apps/:name/fn/:fnName`（`{mode}` 为 `stable` 或 `draft`）。

#### Scenario: 路由路径不变
- **WHEN** 客户端发送 `POST /stable/apps/todo/fn/create`
- **THEN** 请求经 Daemon mount 到达 Runtime，Runtime 在 `/{mode}/apps/:name/fn/:fnName` 路由中处理
- **THEN** 路由支持所有 HTTP 方法（GET、POST、PUT、PATCH、DELETE 等）

#### Scenario: appResolver 中间件替换
- **WHEN** 函数请求到达 Runtime
- **THEN** Runtime 使用注册表查找替代原有的 appResolver 中间件，通过 URL 中的 `:name` 参数和请求路径中的 mode 前缀定位 APP 条目
