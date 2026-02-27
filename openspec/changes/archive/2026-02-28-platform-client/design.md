## Context

当前每个 APP 的 `FunctionContext` 只能访问自身资源（数据库、环境变量等），APP 之间没有标准通信通道。同时，Runtime 通过独立的 `DaemonClient` 接口回调 Daemon 服务（auth verify、theme CSS），而 UI 层通过独立的 `/db/` 路由访问数据。

这导致三个问题：
1. APP 间无法互调（Dashboard 无法聚合其他 APP 数据）
2. 存在两套独立的平台调用接口（`DaemonClient` 和未来的 `PlatformClient`），概念重叠
3. UI 数据访问（`/db/`）和函数调用（`/fn/`）是两条独立路径，PlatformClient 只能触达函数，无法覆盖 CRUD 场景

本设计将这三个问题统一解决：一个 `PlatformClient` 接口，一个 `/fn/` 路由命名空间。

## Goals / Non-Goals

**Goals:**

- 提供统一的 `PlatformClient` 接口，覆盖 APP 间调用、Daemon 服务调用所有场景
- 将 `/db/` auto CRUD 路由迁入 `/fn/_db/` 命名空间，使所有数据访问统一走函数路径
- 吸收 `DaemonClient`，消除重复抽象
- 接口可插拔：当前单进程直接调用，未来可切换为 HTTP 跨进程调用

**Non-Goals:**

- 不实现能力注册（capability-registration）— 属于独立变更
- 不实现 `core` 虚拟 namespace — 依赖 capability-registration
- 不修改 APP 的 `app.yaml` 格式
- 不引入 GraphQL 或其他查询语言

## Decisions

### Decision 1: 统一 PlatformClient 接口，吸收 DaemonClient

```typescript
interface PlatformClient {
  call(target: string, path: string, options?: RequestInit): Promise<Response>;
}
```

**`target`** 的路由规则：
- 普通 APP 名（如 `'todos'`）→ 路由到该 APP 的 `/fn/` 路由
- `'_platform'` → 路由到 Daemon 内部服务

**为什么吸收 DaemonClient 而不是保持两个接口：**

`DaemonClient` 当前只有两个方法（`verifyAuth`、`getThemeCSS`），本质上就是对 Daemon 服务的远程调用。PlatformClient 的 `call()` 完全可以覆盖：

```typescript
// 之前
daemonClient.verifyAuth(header)
daemonClient.getThemeCSS()

// 之后
platformClient.call('_platform', 'auth/verify', { method: 'POST', headers: { Authorization: header } })
platformClient.call('_platform', 'theme/css')
```

保持单一接口减少概念负担，也为 capability-registration 预留了扩展路径 — 未来 `_platform/auth/verify` 可以由注册了 auth 能力的 APP 接管。

**`_platform` 名称选择：** 使用下划线前缀与现有约定一致（`_` 开头的函数文件不暴露为 API）。Daemon 校验 APP 创建时拒绝 `_` 前缀的 APP 名，不会与用户 APP 冲突。

### Decision 2: Auto CRUD 迁入 `/fn/_db/` 命名空间

当前 `/db/` 路由作为独立命名空间存在。迁入 `/fn/_db/` 后，所有数据访问统一走函数路径。

**新路由结构：**

```
/{mode}/apps/:name/fn/
├── _db/
│   ├── schemas                  GET    → 数据库 schema 内省
│   ├── sql                      POST   → raw SQL 执行
│   └── tables/
│       ├── :table               GET    → 列表查询 (filter/sort/paginate)
│       │                        POST   → 创建记录
│       └── :table/:id           GET    → 获取单条记录
│                                PATCH  → 更新记录
│                                DELETE → 删除记录
├── :fnName                      ALL    → 手写 function（现有行为不变）
```

**为什么用 `_db` 前缀而不是其他：**
- `_` 前缀在函数约定中已经被定义为"不暴露为 API 端点"的内部用途，auto CRUD 由系统生成，语义契合
- 路径层级清晰：`_db/tables/:table` 比 `_table/:table` 更有结构感，也为 `_db/schemas`、`_db/sql` 等管理端点留出了自然位置

**路由实现方式：**

当前函数路由是 `app.all('/:fnName', ...)` 的扁平结构。`_db` 需要嵌套路由。实现方式：

```
/fn/_db/*    → 由新的 auto CRUD 路由模块处理（复用现有 db routes 逻辑）
/fn/:fnName  → 由现有函数执行器处理（不变）
```

在 Hono 中，`_db/*` 路由优先于 `:fnName` 通配，因此只需在 `createFunctionRoutes()` 中先挂载 `_db` 子路由即可。

**迁移影响：**

现有 UI 模板中的 `/db/` 引用需要更新为 `/fn/_db/tables/`。具体影响文件：
- `packages/daemon/templates/welcome/ui/pages.json`（4 处引用）
- 用户已创建的 APP 的 `pages.json`（需要在模板迁移时一并处理）

考虑到现在系统处于早期阶段，不需要向后兼容层。直接迁移。

### Decision 3: PlatformClient 内部执行路径

**同进程（当前实现）：**

```
platform.call('todos', '_db/tables/tasks')
  → 构造 Request: GET /{mode}/apps/todos/fn/_db/tables/tasks
  → 通过 Hono app.request() 内部路由
  → 返回 Response
```

使用 `app.request()` 的好处是 **路由逻辑只写一次** — PlatformClient 和外部 HTTP 请求走完全相同的代码路径。

**跨进程（未来扩展）：**

```
platform.call('todos', '_db/tables/tasks')
  → HTTP fetch 到 Daemon URL
  → Daemon 路由到正确的 Runtime 进程
  → 返回 Response
```

接口相同，实现不同：

```typescript
// 同进程
function createInProcessPlatformClient(runtimeApp: Hono, mode: AppMode): PlatformClient

// 跨进程（未来）
function createHttpPlatformClient(daemonUrl: string): PlatformClient
```

**关键点：** 对 APP 函数调用和 `_platform` 调用需要走不同的 Hono app：
- APP 函数调用 → 走 Runtime 的 Hono app（`runtimeApp`）
- `_platform` 调用 → 走 Daemon 的 Hono app（`daemonApp`）

因此同进程实现需要接收两个 app 引用：

```typescript
function createInProcessPlatformClient(
  runtimeApp: Hono,
  daemonApp: Hono,
  mode: AppMode
): PlatformClient
```

但这暴露了过多内部细节。更好的封装是让 Runtime 的 `createRuntime()` 接收一个回调或配置，由 Daemon 在创建时注入 `_platform` 的处理逻辑。

实际上最简单的方式：**`_platform` 路由也注册在 Runtime 的 Hono app 上（由 Daemon 注入）**，这样 PlatformClient 只需要一个 app 引用。但这会打破 Runtime 和 Daemon 的职责边界。

**最终方案：** PlatformClient 接收一个 handler 映射：

```typescript
interface PlatformClientConfig {
  runtimeApp: Hono;          // 处理 APP 间调用
  platformHandler: PlatformHandler;  // 处理 _platform 调用
  mode: AppMode;
}

interface PlatformHandler {
  handle(path: string, request: Request): Promise<Response>;
}
```

Daemon 提供 `PlatformHandler` 的实现（同进程直接调用 Daemon app，跨进程走 HTTP）。这样 Runtime 不需要知道 Daemon 的内部结构。

### Decision 4: 内部调用的认证处理

PlatformClient 发起的调用是系统内部调用，**不经过外部认证中间件**。

原因：
- APP 函数只有在自身已通过认证后才能执行（外层请求已被 auth gate 拦截）
- 内部调用是 trusted context，类似于微服务间的 service-to-service 调用
- 添加认证会引入循环依赖问题（auth 本身就可能是一个 APP function）

实现方式：PlatformClient 通过 `app.request()` 发起的内部请求不会经过 Daemon 的外层中间件（CORS、auth 等），因为它直接调用 Runtime app 而非 Daemon app。

### Decision 5: 循环调用保护

APP A 调 APP B，APP B 又调 APP A，可能导致无限递归。

**方案：调用深度计数器**

在 PlatformClient 发起请求时，通过自定义 header（如 `X-Platform-Call-Depth`）传递调用深度。每次内部调用 depth +1，超过阈值（如 10）则拒绝。

```
APP A → platform.call('B', 'fn') [depth=1]
  → APP B → platform.call('A', 'fn') [depth=2]
    → APP A → platform.call('B', 'fn') [depth=3]
      → ... [depth > 10 → 返回 508 Loop Detected]
```

这种方式：
- 不需要全局状态或锁
- 通过 Request header 传递，天然穿透内部 `app.request()` 调用链
- 阈值可配置

### Decision 6: createRuntime() 接口变更

当前 `createRuntime()` 返回 `{ app, registry }`，不接收参数。

变更后需要接收 `PlatformHandler`（由 Daemon 提供），用于处理 `_platform` 调用：

```typescript
interface RuntimeOptions {
  platformHandler?: PlatformHandler;
}

function createRuntime(options?: RuntimeOptions): {
  app: Hono;
  registry: AppRegistry;
}
```

Runtime 内部使用 `options.platformHandler` 构建 PlatformClient，注入到每个 FunctionContext 中。

### Decision 7: 废弃 `/db/` 路由和 DaemonClient

- `/db/` 路由：直接移除（`createDbRoutes()` 及其在 `index.ts` 中的 mount 点）。功能由 `/fn/_db/` 接管。
- `DaemonClient` 接口：移除 `daemon-client.ts`，功能由 `PlatformClient` 接管。`createInProcessDaemonClient` 和 `createHttpDaemonClient` 删除。
- `auth-delegation.ts` 中间件：改为使用 PlatformClient 调用 `_platform/auth/verify`。

由于系统处于早期阶段，不保留向后兼容。

## Risks / Trade-offs

**[Risk] `app.request()` 内部调用的性能开销**
→ Hono 的 `app.request()` 走完整的中间件链和路由匹配，有一定开销。但对于 Local BaaS 场景，请求量不大，可接受。如果未来成为瓶颈，可以绕过路由直接调用函数执行器。

**[Risk] `/db/` 到 `/fn/_db/` 的迁移影响现有 APP**
→ 当前只有 welcome 模板 APP 使用了 `/db/` 引用（4 处）。系统早期用户极少，直接迁移成本低。已创建 APP 的 `pages.json` 需要手动更新。

**[Risk] PlatformClient 在 FunctionContext 中暴露过多能力**
→ APP function 可以通过 PlatformClient 访问任何其他 APP 的数据。当前阶段这是预期行为（Local BaaS，信任所有 APP）。未来 capability-registration 可以在这一层加入权限控制。

**[Trade-off] `_platform` 路由注册在 Runtime 还是 Daemon**
→ 选择由 Daemon 提供 `PlatformHandler` 注入 Runtime，而非在 Runtime 中注册 `_platform` 路由。这保持了 Runtime 不依赖 Daemon 内部实现的边界，但增加了接口传递的复杂度。

**[Trade-off] Auto CRUD 放在 `/fn/_db/` 而非保持 `/db/` 独立**
→ 统一路径简化了 PlatformClient 的设计（只需 `call()` 一个方法），但增加了一次迁移成本。考虑到系统早期阶段，统一的长期收益大于短期迁移成本。
