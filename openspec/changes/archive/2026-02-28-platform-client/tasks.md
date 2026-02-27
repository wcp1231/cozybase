## 1. PlatformClient 接口与类型定义

- [x] 1.1 在 `packages/runtime/src/platform-client.ts` 中定义 `PlatformClient` 接口和 `PlatformHandler` 接口
- [x] 1.2 在 `packages/runtime/src/modules/functions/types.ts` 中为 `FunctionContext` 增加 `platform: PlatformClient` 属性

## 2. PlatformClient 同进程实现

- [x] 2.1 在 `packages/runtime/src/platform-client.ts` 中实现 `createInProcessPlatformClient(runtimeApp, platformHandler, mode)` 工厂函数
- [x] 2.2 实现 `call()` 方法的 target 路由逻辑：普通 APP 名 → `runtimeApp.request()`，`_platform` → `platformHandler.handle()`
- [x] 2.3 实现循环调用保护：读取和传递 `X-Platform-Call-Depth` header，超过阈值返回 508

## 3. Auto CRUD 路由迁移

- [x] 3.1 在 `packages/runtime/src/modules/functions/routes.ts` 中挂载 `_db/*` 子路由（优先于 `:fnName` 通配）
- [x] 3.2 将现有 `packages/runtime/src/modules/db/routes.ts` 的 CRUD 逻辑迁移到 `/fn/_db/tables/:table` 和 `/fn/_db/tables/:table/:id` 路由
- [x] 3.3 将 `/db/schema` 迁移到 `/fn/_db/schemas`，`/db/sql` 和 `/db/_sql` 迁移到 `/fn/_db/sql`
- [x] 3.4 从 `packages/runtime/src/index.ts` 中移除 `createDbRoutes()` 的独立 mount 点（`/stable/apps/:name/db` 和 `/draft/apps/:name/db`）

## 4. DaemonClient 移除与 PlatformHandler 注入

- [x] 4.1 在 Daemon 端实现 `PlatformHandler`，将 `_platform/auth/verify` 映射到 `/internal/auth/verify`，`_platform/theme/css` 映射到 `/api/v1/theme/css`
- [x] 4.2 修改 `packages/runtime/src/index.ts` 的 `createRuntime()` 接收 `RuntimeOptions`，内部构建 PlatformClient 并返回
- [x] 4.3 修改 `packages/daemon/src/server.ts`，创建 PlatformHandler 并传入 `createRuntime({ platformHandler })`
- [x] 4.4 修改 `packages/runtime/src/middleware/auth-delegation.ts`，从使用 DaemonClient 改为使用 PlatformClient
- [x] 4.5 删除 `packages/runtime/src/daemon-client.ts` 文件，移除 `index.ts` 中的 DaemonClient 导出

## 5. FunctionContext 注入 PlatformClient

- [x] 5.1 修改 `packages/runtime/src/modules/functions/context.ts` 的 `buildFunctionContext()`，接收 PlatformClient 并注入到 context
- [x] 5.2 修改 `packages/runtime/src/modules/functions/executor.ts`，将 PlatformClient 传递给 `buildFunctionContext()`

## 6. APP 名称校验

- [x] 6.1 在 `packages/daemon/src/modules/apps/manager.ts` 的 APP 创建逻辑中，拒绝以 `_` 开头的 APP 名称

## 7. 模板迁移

- [x] 7.1 更新 `packages/daemon/templates/welcome/ui/pages.json`，将 `/db/todo` 引用改为 `/fn/_db/tables/todo`

## 8. 测试验证

- [x] 8.1 编写 PlatformClient 单元测试：APP 间调用、`_platform` 调用、循环调用保护
- [x] 8.2 编写 auto CRUD 路由测试：确保 `/fn/_db/tables/:table` CRUD 操作正常
- [x] 8.3 验证现有函数路由测试通过（`/fn/:fnName` 行为不变）
- [x] 8.4 端到端验证：通过 UI 使用新的 `/fn/_db/` 路由访问 welcome APP 数据
