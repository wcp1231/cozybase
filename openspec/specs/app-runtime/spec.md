# APP Runtime

## Purpose

Provide the runtime execution layer for APP processes, including an in-memory registry for APP lifecycle management, route handling for functions/DB/UI, and authentication delegation to the Daemon.

## Requirements

### Requirement: Runtime 包入口

Runtime 包 SHALL 导出 `createRuntime(options?)` 函数，接收可选的 `RuntimeOptions` 参数，返回 `{ app, registry, platformClient }`。`app` 是包含所有 APP 对外路由的 Hono 实例；`registry` 是 `AppRegistry` 实例，供 Daemon 直接调用管理 APP 生命周期；`platformClient` 是 `PlatformClient` 实例，供 Daemon 中间件使用。

```typescript
interface RuntimeOptions {
  platformHandler?: PlatformHandler;
}
```

Runtime SHALL 不再导出 `DaemonClient` 相关接口和工厂函数。`createInProcessDaemonClient` 和 `createHttpDaemonClient` SHALL 被移除，其功能由 `PlatformClient` 接管。

#### Scenario: 创建 Runtime 实例
- **WHEN** Daemon 调用 `createRuntime({ platformHandler })`
- **THEN** 返回 `{ app, registry, platformClient }`，其中 `app` 包含对外路由（`/stable/apps/:name/fn/*`、`/draft/apps/:name/fn/*` 等），`registry` 提供 `start()`、`stop()`、`restart()`、`shutdownAll()` 方法，`platformClient` 提供 `call()` 方法

#### Scenario: Daemon mount Runtime
- **WHEN** Daemon 通过 `app.route('/', runtimeApp)` mount Runtime
- **THEN** 客户端可以通过 `/stable/apps/:name/*` 和 `/draft/apps/:name/*` 访问 APP 的运行时功能
- **AND** 不暴露任何内部管理路由

#### Scenario: 不提供 platformHandler
- **WHEN** Daemon 调用 `createRuntime()` 且不提供 `platformHandler`
- **THEN** PlatformClient 的 `_platform` 调用 SHALL 返回 HTTP 501 Not Implemented

### Requirement: APP 生命周期管理（Registry 直接调用）

Daemon SHALL 通过 `AppRegistry` 实例直接管理 APP 生命周期（同进程），不通过 HTTP 内部 API。

#### Scenario: 启动 APP
- **WHEN** Daemon 调用 `registry.start('todo', { mode: 'stable', dbPath: '...', functionsDir: '...', uiDir: '...' })`
- **THEN** Registry 在注册表中创建 `todo:stable` 条目，打开 DB 连接，准备函数加载，状态变为 `running`

#### Scenario: 启动已存在的 APP
- **WHEN** Daemon 对已处于 `running` 状态的 APP 调用 `registry.start('todo', { mode: 'stable', ... })`
- **THEN** Registry 抛出 `AppRegistryError(409)` 错误

#### Scenario: 停止 APP
- **WHEN** Daemon 调用 `registry.stop('todo', 'stable')`
- **THEN** Registry 关闭 `todo:stable` 的 DB 连接，清除函数缓存，状态变为 `stopped`

#### Scenario: 停止未加载的 APP
- **WHEN** Daemon 对不存在于注册表中的 APP 调用 `registry.stop('unknown', 'stable')`
- **THEN** Registry 抛出 `AppRegistryError(404)` 错误

#### Scenario: 重启 APP
- **WHEN** Daemon 调用 `registry.restart('todo', { mode: 'stable', dbPath: '...', functionsDir: '...', uiDir: '...' })`
- **THEN** Registry 先释放旧资源（关闭 DB、清除缓存），再用新配置启动，状态恢复为 `running`

#### Scenario: 优雅关闭
- **WHEN** Daemon 调用 `registry.shutdownAll()`
- **THEN** Registry 停止所有已加载的 APP（关闭 DB 连接、清除缓存）

### Requirement: APP 注册表

Runtime SHALL 维护内存中的 APP 注册表，使用 `{appName}:{mode}` 作为 key。

#### Scenario: 同一 APP 的 stable 和 draft 共存
- **WHEN** Daemon 分别调用 `registry.start()` 启动 `todo:stable` 和 `todo:draft`
- **THEN** 注册表中同时存在两个条目，各自拥有独立的 DB 连接和函数缓存

#### Scenario: 路由解析使用注册表
- **WHEN** 请求到达 `/stable/apps/todo/fn/list`
- **THEN** Runtime 从注册表中查找 key `todo:stable`，使用其对应的 DB 连接和函数目录

#### Scenario: 请求未加载的 APP
- **WHEN** 请求到达 `/stable/apps/unknown/fn/list`，但 `unknown:stable` 不在注册表中
- **THEN** Runtime 返回 404 Not Found

#### Scenario: 请求已停止的 APP
- **WHEN** 请求到达 `/stable/apps/todo/fn/list`，但 `todo:stable` 状态为 `stopped`
- **THEN** Runtime 返回 503 Service Unavailable

### Requirement: APP 生命周期状态

每个 APP 条目 SHALL 具有以下生命周期状态：`not loaded`（注册表中不存在）、`running`（资源就绪，可处理请求）、`stopped`（资源已释放，拒绝请求）。

#### Scenario: 正常生命周期
- **WHEN** Daemon 依次调用 start → stop → start
- **THEN** APP 状态依次变为 running → stopped → running

#### Scenario: start 时打开资源
- **WHEN** APP 从 not loaded 或 stopped 变为 running
- **THEN** Runtime 打开 SQLite DB 连接，初始化函数模块缓存

#### Scenario: stop 时释放资源
- **WHEN** APP 从 running 变为 stopped
- **THEN** Runtime 关闭 SQLite DB 连接，清除函数模块缓存

### Requirement: APP 对外路由

Runtime SHALL 为每个已加载的 APP 提供以下对外路由。所有路由 SHALL 使用 `/{mode}` 前缀（`{mode}` 为 `stable` 或 `draft`）：

- `GET /{mode}/apps/:name/` -- UI 首页
- `GET /{mode}/apps/:name/assets/*` -- UI 静态资源
- `GET /{mode}/apps/:name/ui.json` -- UI Schema
- `ALL /{mode}/apps/:name/fn/:fnName` -- Functions 执行（手写函数）
- `GET /{mode}/apps/:name/fn/_db/schemas` -- DB Schema 内省
- `POST /{mode}/apps/:name/fn/_db/sql` -- Raw SQL 执行
- `GET /{mode}/apps/:name/fn/_db/tables/:table` -- 列表查询
- `POST /{mode}/apps/:name/fn/_db/tables/:table` -- 创建记录
- `GET /{mode}/apps/:name/fn/_db/tables/:table/:id` -- 获取记录
- `PATCH /{mode}/apps/:name/fn/_db/tables/:table/:id` -- 更新记录
- `DELETE /{mode}/apps/:name/fn/_db/tables/:table/:id` -- 删除记录

原有的独立 `/{mode}/apps/:name/db/*` 路由 SHALL 被移除，其功能由 `/{mode}/apps/:name/fn/_db/*` 接管。

#### Scenario: 函数执行路由
- **WHEN** 客户端发送 `POST /stable/apps/todo/fn/create` 请求
- **THEN** Runtime 从 `todo:stable` 注册表条目加载 `create.ts` 函数并执行

#### Scenario: Auto CRUD 路由
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/tables/tasks`
- **THEN** Runtime 使用 `todo:stable` 的 DB 连接查询 tasks 表并返回结果

#### Scenario: Schema 内省路由
- **WHEN** 客户端发送 `GET /stable/apps/todo/fn/_db/schemas`
- **THEN** Runtime 返回 `todo:stable` 数据库的 schema 信息

#### Scenario: UI 路由
- **WHEN** 客户端发送 `GET /stable/apps/todo/`
- **THEN** Runtime 从 `todo:stable` 的 uiDir 返回 index.html

#### Scenario: 旧 /db/ 路由不可访问
- **WHEN** 客户端发送 `GET /stable/apps/todo/db/tasks`
- **THEN** Runtime SHALL 返回 404（该路由已不存在）

### Requirement: 认证委托

Runtime SHALL 通过 `PlatformClient` 将认证委托给 Daemon，不自行实现认证逻辑。不再使用独立的 `DaemonClient` 接口。

#### Scenario: 认证验证
- **WHEN** 用户请求携带 `Authorization: Bearer <token>` 到达 Runtime
- **THEN** Runtime 通过 `platformClient.call('_platform', 'auth/verify', { method: 'POST', headers: { Authorization: header } })` 验证 token，返回认证结果

#### Scenario: 认证失败
- **WHEN** Daemon 的认证接口返回 `{ "authenticated": false, "error": "token expired" }`
- **THEN** Runtime 返回 401 Unauthorized 给客户端

#### Scenario: 同进程认证调用
- **WHEN** Runtime 和 Daemon 在同一进程中运行
- **THEN** 认证请求通过 PlatformClient 的同进程实现执行，不走实际网络
