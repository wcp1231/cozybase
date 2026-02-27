## MODIFIED Requirements

### Requirement: Management API 路由归属变更

Management API 的 APP CRUD 路由 SHALL 保留在 `packages/daemon` 中，而 APP 运行时路由迁移到 `packages/runtime`。运行时路由使用 `/{mode}/apps/:name/*` 前缀（`{mode}` 为 `stable` 或 `draft`）。

#### Scenario: Daemon 保留的路由
- **WHEN** 客户端发送 APP 管理请求（`POST /api/v1/apps`、`GET /api/v1/apps`、`GET /api/v1/apps/:name`、`PUT /api/v1/apps/:name`、`DELETE /api/v1/apps/:name`）
- **THEN** 请求由 Daemon 直接处理，逻辑不变

#### Scenario: 迁移到 Runtime 的路由
- **WHEN** 客户端发送 APP 运行时请求（`/{mode}/apps/:name/db/*`、`/{mode}/apps/:name/fn/*`）
- **THEN** 请求由 Daemon mount 的 Runtime Hono app 处理

### Requirement: SQL 查询端点迁移

`POST /{mode}/apps/{appName}/db/_sql` 端点 SHALL 从 Daemon 迁移到 Runtime。

#### Scenario: SQL 端点在 Runtime 中运行
- **WHEN** 客户端发送 `POST /stable/apps/todo/db/_sql`
- **THEN** 请求经过 Daemon 路由 mount 到达 Runtime，Runtime 使用 `todo:stable` 注册表条目的 DB 连接执行 SQL
- **AND** SQL 语句分类、权限控制逻辑不变（Draft 模式允许 DML，Stable 模式仅允许 SELECT）

#### Scenario: SQL 端点执行 DML
- **WHEN** 客户端在 Draft 模式发送 `POST /draft/apps/todo/db/_sql` 包含 INSERT/UPDATE/DELETE 语句
- **THEN** Runtime 使用 `stmt.run()` 执行 DML 并返回 `{ changes, lastInsertRowid }`

### Requirement: Daemon 生命周期管理增强

Daemon SHALL 在 APP CRUD 操作后通过 `AppRegistry` 实例直接管理 APP 生命周期。

#### Scenario: 删除 APP 前停止
- **WHEN** Daemon 收到删除 APP 请求
- **THEN** Daemon 先调用 `registry.stop()` 停止 Runtime 中的 stable 和 draft 版本，再清理文件和数据库记录

#### Scenario: Reconcile 后重启 Draft
- **WHEN** Daemon 完成 Draft Reconcile
- **THEN** Daemon 调用 `registry.restart(name, { mode: 'draft', ... })` 重新加载 Draft 版本

#### Scenario: Publish 后重启 Stable 并停止 Draft
- **WHEN** Daemon 完成 Publish
- **THEN** Daemon 调用 `registry.restart(name, { mode: 'stable', ... })` 重新加载 Stable 版本
- **AND** Daemon 调用 `registry.stop(name, 'draft')` 停止 Draft 版本

### Requirement: Daemon 认证接口

Daemon SHALL 暴露内部认证验证接口，供 Runtime 回调验证用户 token。

#### Scenario: Runtime 认证回调
- **WHEN** Runtime 收到携带 `Authorization: Bearer <token>` 的用户请求
- **THEN** Runtime 调用 Daemon 的 `POST /internal/auth/verify`，传递 Authorization header
- **AND** Daemon 返回 `{ "authenticated": true, "user": { "id": "...", "name": "...", "role": "..." } }` 或 `{ "authenticated": false, "error": "..." }`

#### Scenario: 同进程认证调用
- **WHEN** Runtime 和 Daemon 在同一进程中运行
- **THEN** 认证请求通过 Hono `app.request()` 执行，不走实际网络
