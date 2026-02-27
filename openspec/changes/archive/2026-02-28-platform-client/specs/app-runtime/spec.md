## MODIFIED Requirements

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

### Requirement: APP 对外路由

Runtime SHALL 为每个已加载的 APP 提供以下对外路由。所有路由 SHALL 使用 `/{mode}` 前缀（`{mode}` 为 `stable` 或 `draft`）：

- `GET /{mode}/apps/:name/` — UI 首页
- `GET /{mode}/apps/:name/assets/*` — UI 静态资源
- `GET /{mode}/apps/:name/ui.json` — UI Schema
- `ALL /{mode}/apps/:name/fn/:fnName` — Functions 执行（手写函数）
- `GET /{mode}/apps/:name/fn/_db/schemas` — DB Schema 内省
- `POST /{mode}/apps/:name/fn/_db/sql` — Raw SQL 执行
- `GET /{mode}/apps/:name/fn/_db/tables/:table` — 列表查询
- `POST /{mode}/apps/:name/fn/_db/tables/:table` — 创建记录
- `GET /{mode}/apps/:name/fn/_db/tables/:table/:id` — 获取记录
- `PATCH /{mode}/apps/:name/fn/_db/tables/:table/:id` — 更新记录
- `DELETE /{mode}/apps/:name/fn/_db/tables/:table/:id` — 删除记录

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

## REMOVED Requirements

### Requirement: DaemonClient 接口
**Reason**: DaemonClient 的功能被 PlatformClient 统一接口吸收。PlatformClient 通过 `call('_platform', path)` 覆盖了原 DaemonClient 的所有方法（`verifyAuth`、`getThemeCSS`）。
**Migration**: 将 `daemonClient.verifyAuth(header)` 替换为 `platformClient.call('_platform', 'auth/verify', ...)`；将 `daemonClient.getThemeCSS()` 替换为 `platformClient.call('_platform', 'theme/css')`。
