## Why

当前 APP 声明文件仅包含 `migrations/`（数据库 schema）和 `seeds/`（测试数据），只定义了**数据层**，缺少**行为层**。AI Agent 无法通过声明文件定义自定义 API 端点、业务逻辑等能力。代码中已有 `functions/*.ts` 的发现逻辑（`workspace.ts`），但执行运行时尚未实现，需要补齐这一关键缺失。

## What Changes

- 新增 `FunctionRuntime` 接口抽象，定义函数加载与执行的统一协议
- MVP 阶段实现 `DirectRuntime`（主进程内直接 `import()` TypeScript 文件）
- 定义 `FunctionContext` 接口，为函数提供 `req`、`db`、`env`、`log`、`fetch` 等运行时能力
- 采用 Next.js Route Handler 风格的命名导出约定（`GET`、`POST`、`PUT`、`DELETE` 等），支持单文件多 HTTP 方法
- 同时支持 `export default`（兜底处理所有方法）和命名导出（精确匹配方法）
- 注册 `/stable/apps/:appName/functions/:name` 和 `/draft/apps/:appName/functions/:name` 路由
- Draft 模式下每次请求重新 `import()`（热重载），Stable 模式下缓存模块
- Draft Reconcile 阶段新增可选的函数语法验证步骤
- Publish 阶段将函数文件纳入 git commit

## Capabilities

### New Capabilities

- `function-runtime`: 函数运行时核心能力，包括 FunctionRuntime 接口抽象、DirectRuntime 实现、FunctionContext 设计、TypeScript 函数文件约定（命名导出 HTTP method handler）、函数路由注册、Draft 热重载与 Stable 缓存策略

### Modified Capabilities

- `reconciler-draft-stable`: Draft Reconcile 新增可选的函数文件验证（检查语法和导出格式）；Publish 流程中明确函数文件的 git commit 行为（已有描述但需细化）

## Impact

- **新增代码**：`packages/server/src/modules/functions/` — 路由、运行时、context 构建
- **新增类型**：`FunctionRuntime` 接口、`FunctionContext` 接口、`DirectRuntime` 实现
- **修改代码**：`packages/server/src/server.ts` — 注册 function 路由；`packages/server/src/core/draft-reconciler.ts` — 可选函数验证步骤
- **API 新增**：`/stable/apps/:appName/functions/:name` 和 `/draft/apps/:appName/functions/:name`（支持 GET/POST/PUT/PATCH/DELETE）
- **依赖**：无新外部依赖（Bun 原生支持动态 `import()` TypeScript 文件）
- **未来扩展点**：`WorkerRuntime`（每 APP 一个 Bun Worker）、函数间互调（`ctx.invoke`）、自定义中间件（`_middleware.ts`）、Database Hook、Cron Job
