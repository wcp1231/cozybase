## Context

当前 cozybase 的 APP 声明仅覆盖数据层（`migrations/` + `seeds/`），代码中 `workspace.ts` 已实现 `functions/*.ts` 文件发现并存入 `AppDefinition.functions[]`，但 `packages/server/src/modules/functions/` 目录为空，没有加载和执行逻辑。

现有架构提供了良好的集成点：
- `appResolver` 中间件已实现 AppContext + mode 注入
- `server.ts` 中 Stable/Draft 路由分离模式成熟（DB 路由可直接复用模式）
- Bun 原生支持 `import()` TypeScript 文件，无需编译步骤

## Goals / Non-Goals

**Goals:**

- 定义 `FunctionRuntime` 接口，抽象函数加载与执行，为未来 WorkerRuntime 预留扩展点
- 实现 `DirectRuntime`（MVP），在主进程内通过 `import()` 加载并执行用户 TypeScript 函数
- 设计 `FunctionContext`，提供 `req`、`db`、`env`、`log`、`fetch` 等运行时能力
- 采用 Next.js Route Handler 风格的命名导出约定，支持单文件多 HTTP 方法
- 注册 `/stable/apps/:appName/functions/:name` 和 `/draft/apps/:appName/functions/:name` 路由
- Draft 模式每次请求重新 `import()`（热重载），Stable 模式缓存模块

**Non-Goals:**

- WorkerRuntime（每 APP 一个 Bun Worker 隔离执行）— 作为未来扩展方向，不在本次实现
- 函数间互调（`ctx.invoke`）— MVP 阶段不实现
- 自定义中间件（`_middleware.ts`）— MVP 阶段不实现
- Database Hook 和 Cron Job — 通过 `functions/` 导出约定预留，不在本次实现
- 函数级权限控制和沙箱隔离

## Decisions

### Decision 1: FunctionRuntime 接口抽象

**选择**: 定义 `FunctionRuntime` 接口，MVP 实现 `DirectRuntime`

**备选方案**:
- A) 直接在路由中 `import()` 执行，不做抽象 — 更简单但未来切换执行环境需重写路由层
- B) 直接上 Bun Worker — 隔离性好但引入 postMessage 序列化开销、数据库连接需独立管理、复杂度高

**理由**: 接口抽象成本极低（一个 interface + 一个实现类），但为 WorkerRuntime 迁移提供了清晰的边界。路由层只依赖接口，切换实现时零改动。

```typescript
interface FunctionRuntime {
  execute(
    app: AppContext,
    functionName: string,
    request: Request,
  ): Promise<Response>

  reload(appName: string): Promise<void>
  shutdown(): Promise<void>
}
```

### Decision 2: FunctionContext 设计

**选择**: 提供 `req`、`db`、`env`、`app`、`mode`、`log`、`fetch` 的组合对象

```typescript
interface FunctionContext {
  req: Request                     // 标准 Web Request
  db: DatabaseClient               // 当前 mode 的 SQLite 封装
  env: Record<string, string>      // 环境变量
  app: { name: string }            // APP 信息
  mode: 'stable' | 'draft'        // 运行模式
  log: Logger                      // 结构化日志
  fetch: typeof globalThis.fetch   // HTTP 客户端
}

interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): T[]
  run(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number }
  exec(sql: string): void
}
```

**理由**: `DatabaseClient` 封装原始 `bun:sqlite` 的 `Database` 对象，提供更简洁的 API，同时隐藏底层实现（为 WorkerRuntime 下的代理模式预留空间）。`log` 使用结构化日志，便于 AI Agent 调试追踪。`fetch` 透传全局 fetch，未来可在此层注入超时、重试等策略。

### Decision 3: HTTP 方法路由约定

**选择**: Next.js Route Handler 风格 — 命名导出 + default 兜底

**Handler 解析优先级**:
1. 命名导出匹配 HTTP method（`export async function GET`、`POST`、`PUT`、`PATCH`、`DELETE`、`HEAD`、`OPTIONS`）
2. `export default` 作为兜底处理所有未命名的 method
3. 两者都不存在 → 返回 `405 Method Not Allowed`

**备选方案**:
- A) 只支持 `export default` + `config.method` — 一个文件只能处理一个 method，需拆分多个文件
- B) 文件名约定（`orders.get.ts`、`orders.post.ts`）— 文件数量膨胀，相关逻辑分散

**理由**: Next.js 约定被广泛认知（AI Agent 和人类开发者都熟悉），支持单文件多 method 减少文件数量，同时 `default` export 保持简单场景的极简写法。

**返回值约定**:
- 返回 `Response` 对象 → 直接透传
- 返回普通对象/数组 → 自动 `JSON.stringify` 包装为 `200 application/json`
- 返回 `null`/`undefined` → `204 No Content`
- 抛出异常 → 由全局错误处理器捕获

### Decision 4: 模块加载与缓存策略

**选择**: Draft 每次请求重新 import，Stable 缓存模块

**实现机制**:
- Draft: 每次请求 `import(filePath + '?t=' + Date.now())`，利用 query string 绕过 Bun 的模块缓存
- Stable: 首次 import 后缓存模块引用到 `Map<string, FunctionModule>`，通过 `reload()` 清除缓存

**备选方案**:
- A) 使用 `Bun.file().text()` + `new Function()` — 无法利用 TypeScript 编译，不支持 import 语句
- B) 使用文件监听（fs.watch）自动重载 — 增加复杂度，MVP 阶段不需要

**理由**: `import()` 是 Bun 原生支持的最简路径，query string cache bust 是已知可靠的热重载手段。Stable 缓存避免重复解析和编译开销。

### Decision 5: 路由注册模式

**选择**: 复用现有 `appResolver` + 通配符路由模式

```
/stable/apps/:appName/functions/:name  →  appResolver(workspace, 'stable') + functionHandler
/draft/apps/:appName/functions/:name   →  appResolver(workspace, 'draft')  + functionHandler
```

路由使用 `app.all()` 匹配所有 HTTP 方法，由 FunctionRuntime 内部根据命名导出分派。

**理由**: 与现有 DB 路由（`/stable/apps/:appName/db/*`）完全对称，复用 `appResolver` 中间件获取 AppContext 和 mode，保持架构一致性。

### Decision 6: 函数文件约定

**命名规则**:
- 文件名匹配 `^[a-zA-Z0-9_-]+\.ts$`
- `_` 前缀的文件（如 `_middleware.ts`、`_utils.ts`）不暴露为 API 端点（预留）
- 文件名直接映射为路由中的 `:name` 参数

**目录结构**:
```
apps/{app-name}/functions/
├── orders.ts          # → /functions/orders
├── health.ts          # → /functions/health
├── _middleware.ts      # 不暴露（预留）
└── _utils.ts          # 不暴露（预留）
```

### Decision 7: 错误处理

**选择**: 复用现有 `AppError` 体系

- 函数内抛出 `AppError` 子类 → 按其 statusCode 返回
- 函数内抛出普通 `Error` → 包装为 `500 Internal Server Error`
- 函数文件不存在 → `404 Not Found`
- HTTP method 不支持 → `405 Method Not Allowed`
- 函数加载失败（语法错误等） → `500` + 错误信息（Draft 模式下包含详细堆栈）

## Risks / Trade-offs

**[安全性] 主进程内执行用户代码** → MVP 阶段接受此风险。cozybase 定位为本地 BaaS，用户代码来源受控。未来通过 WorkerRuntime 实现隔离。

**[稳定性] 用户函数崩溃影响主进程** → 通过 try-catch 包裹执行，捕获同步和异步异常。无法防御的场景：无限循环、内存泄漏。未来 WorkerRuntime + 超时机制可解决。

**[性能] Draft 模式每次重新 import** → 本地开发场景下可接受。Bun 的 TypeScript 编译速度极快（毫秒级）。Stable 模式有缓存不受影响。

**[兼容性] import() cache bust 依赖 Bun 行为** → `?t=timestamp` 绕过缓存是常见模式，但依赖 Bun 的具体实现。若 Bun 行为变化，可回退到删除 require cache 或使用 `Loader` API。

**[扩展性] 单层路由（无嵌套路径）** → 当前 `:name` 只映射文件名，不支持 `functions/orders/items` 这样的嵌套路径。MVP 足够，未来可通过文件夹约定或 catch-all 路由扩展。
