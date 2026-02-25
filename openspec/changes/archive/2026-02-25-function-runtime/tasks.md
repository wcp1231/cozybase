## 1. 类型定义

- [x] 1.1 在 `packages/server/src/modules/functions/types.ts` 中定义 `FunctionRuntime` 接口（`execute`、`reload`、`shutdown` 方法）
- [x] 1.2 在 `packages/server/src/modules/functions/types.ts` 中定义 `FunctionContext` 接口（`req`、`db`、`env`、`app`、`mode`、`log`、`fetch`）
- [x] 1.3 在 `packages/server/src/modules/functions/types.ts` 中定义 `DatabaseClient` 接口（`query`、`run`、`exec` 方法）
- [x] 1.4 在 `packages/server/src/modules/functions/types.ts` 中定义 `Logger` 接口（`info`、`warn`、`error`、`debug` 方法）

## 2. DatabaseClient 实现

- [x] 2.1 在 `packages/server/src/modules/functions/database-client.ts` 中实现 `DatabaseClient`，封装 `bun:sqlite` 的 `Database` 对象，提供 `query`、`run`、`exec` 方法

## 3. Logger 实现

- [x] 3.1 在 `packages/server/src/modules/functions/logger.ts` 中实现 `Logger`，输出包含 APP 名称、函数名称、运行模式的结构化日志

## 4. FunctionContext 构建

- [x] 4.1 在 `packages/server/src/modules/functions/context.ts` 中实现 `buildFunctionContext` 函数，根据 `AppContext`、`appMode`、函数名称和 `Request` 构建 `FunctionContext` 对象

## 5. DirectRuntime 实现

- [x] 5.1 在 `packages/server/src/modules/functions/direct-runtime.ts` 中实现 `DirectRuntime` 类
- [x] 5.2 实现 `execute` 方法：动态 `import()` 函数文件、解析命名导出/default 导出、构建 FunctionContext、调用 handler
- [x] 5.3 实现 Draft 模式热重载：通过 query string cache bust（`?t=Date.now()`）绕过模块缓存
- [x] 5.4 实现 Stable 模式模块缓存：使用 `Map<string, Module>` 缓存已加载模块
- [x] 5.5 实现 `reload` 方法：清除指定 APP 的模块缓存
- [x] 5.6 实现 `shutdown` 方法：清除所有缓存
- [x] 5.7 实现返回值处理逻辑：`Response` 透传、对象/数组自动 JSON 序列化、`null` 返回 204、异常处理
- [x] 5.8 实现函数文件校验：`_` 前缀文件返回 404、文件不存在返回 404、无匹配 handler 返回 405

## 6. 函数路由注册

- [x] 6.1 在 `packages/server/src/modules/functions/routes.ts` 中创建函数路由，使用 `app.all('/functions/:name', ...)` 匹配所有 HTTP 方法
- [x] 6.2 在 `packages/server/src/server.ts` 中注册 Stable 函数路由：`/stable/apps/:appName/functions/:name`，使用 `appResolver(workspace, 'stable')`
- [x] 6.3 在 `packages/server/src/server.ts` 中注册 Draft 函数路由：`/draft/apps/:appName/functions/:name`，使用 `appResolver(workspace, 'draft')`
- [x] 6.4 在 `server.ts` 中初始化 `DirectRuntime` 实例并传入路由

## 7. Reconciler 集成

- [x] 7.1 在 `packages/server/src/core/draft-reconciler.ts` 中新增可选的函数验证步骤：尝试 `import()` 每个函数文件，检查是否有有效导出
- [x] 7.2 函数验证失败时以警告形式附加到 Reconcile 返回结果，不阻塞流程
- [x] 7.3 在 `packages/server/src/core/publisher.ts` 中 migration 成功后调用 `FunctionRuntime.reload(appName)` 刷新 Stable 模块缓存

## 8. 测试验证

- [x] 8.1 在示例 app（`hello`）中创建示例函数文件 `functions/health.ts`（`GET` 导出返回健康状态）
- [x] 8.2 手动验证 Draft Reconcile → 调用 Draft 函数 → Publish → 调用 Stable 函数的完整流程
- [x] 8.3 验证 Draft 热重载：修改函数文件后再次请求，确认执行最新代码
- [x] 8.4 验证错误场景：函数不存在（404）、method 不支持（405）、语法错误（500）
