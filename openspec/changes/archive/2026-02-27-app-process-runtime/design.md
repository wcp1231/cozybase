## Context

cozybase 当前的 `packages/server` 包含所有逻辑：Management API、Reconciler/Publisher、Function 执行、DB CRUD、UI 渲染、Admin SPA serving。这些逻辑可以清晰地分为两类：

- **管理层 (Daemon)**：APP 生命周期（CRUD、Reconcile、Publish）、用户认证、Platform DB、MCP Server、Admin SPA
- **执行层 (Runtime)**：APP Functions 执行、DB CRUD 查询、UI serving

目标是将两者拆分为独立的包，定义清晰的接口，使得：
1. 当前阶段在同进程内运行，Daemon 通过 Hono `app.request()` 调用 Runtime 的 HTTP 接口（零网络开销）
2. 未来需要时可拆为独立进程，Daemon 通过真正的 HTTP 调用 Runtime（改一行代码）

## Goals / Non-Goals

**Goals:**

- 将 `packages/server` 拆分为 `packages/daemon` 和 `packages/runtime`
- Daemon 和 Runtime 之间的所有通信统一为 HTTP 接口（包括 APP 管理和认证）
- Runtime 不直接读取 Platform DB，所有 APP 信息由 Daemon 通过管理接口下发
- APP UI 独立于 Admin UI，通过 iframe 嵌入
- 支持 APP 安装第三方 npm 依赖（Bun Workspace）
- 接口设计为标准 HTTP，确保未来可零成本拆分为独立进程

**Non-Goals:**

- 当前阶段不做进程分离（仍为单一 Bun 进程）
- 不实现 per-APP 进程隔离
- 不实现 Dashboard 数据聚合（预留接口）
- 不实现多机部署

## Decisions

### Decision 1: Package 分离，同进程运行

**选择**: 拆分为 `packages/daemon` + `packages/runtime` 两个包，当前阶段在同一个 Bun 进程中运行

**核心原则**: Daemon 负责管理，Runtime 负责执行

**职责划分**:

```
packages/daemon (管理层)              packages/runtime (执行层)
─────────────────────────             ─────────────────────────
APP 生命周期 CRUD                     APP Functions 加载和执行
Platform DB (apps, app_files)         APP DB 连接和 CRUD 路由
Reconciler (Draft 重建)               APP UI 静态文件 serving
Publisher (Draft → Stable)            APP UI Schema 接口
用户管理和认证                        APP 生命周期执行（启动/停止）
Admin SPA serving                     内部管理 API
MCP Server                            (不持有 APP 列表，由 Daemon 下发)
路由 mount / HTTP 代理                (不处理认证，委托 Daemon)
```

**同进程调用方式**:

```typescript
// packages/runtime/src/index.ts
export function createRuntime(): Hono {
  const app = new Hono();

  // 对外运行时路由 (Daemon mount 给客户端访问)
  app.route('/apps/:name/fn', fnRoutes);
  app.route('/apps/:name/db', dbRoutes);
  app.get('/apps/:name/*', uiStatic);

  // 内部管理 API (仅 Daemon 调用)
  app.post('/internal/apps/:name/start', startHandler);
  app.post('/internal/apps/:name/stop', stopHandler);
  app.post('/internal/apps/:name/restart', restartHandler);
  // ...

  return app;
}

// packages/daemon/src/server.ts
import { createRuntime } from '@cozybase/runtime';

const runtime = createRuntime();

// mount 对外路由
app.route('/stable', runtime);
app.route('/draft', runtime);

// Daemon 调用 Runtime 的内部 API (同进程，不走网络)
await runtime.request('/internal/apps/todo/start', {
  method: 'POST',
  body: JSON.stringify({ dbPath, functionsDir, uiDir }),
});

// 未来 (分进程):
// await fetch(`http://localhost:${runtimePort}/internal/apps/todo/start`, { ... });
```

**理由**:
- 同进程运行 = 零性能损失，零运维复杂度
- 所有通信统一为 HTTP 接口，同进程和分进程的差异仅在于 `runtime.request()` vs `fetch()`
- Package 边界强制代码隔离，Runtime 不能直接 import Daemon 的内部模块

### Decision 2: Daemon → Runtime 通信 —— HTTP 内部管理 API

**选择**: Runtime 暴露 HTTP 内部管理 API，Daemon 通过 HTTP 请求管理 APP 的生命周期

**内部管理 API**:

```
# APP 生命周期管理 (仅 Daemon 调用)
POST /internal/apps/:name/start      启动 APP
POST /internal/apps/:name/stop       停止 APP
POST /internal/apps/:name/restart    重启 APP (stop + start)
GET  /internal/apps/:name/status     查询 APP 状态

# Runtime 全局管理
GET  /internal/health                健康检查
POST /internal/shutdown              优雅关闭所有 APP
```

**Start 请求体**:
```typescript
interface AppStartRequest {
  // 模式
  mode: 'stable' | 'draft';

  // 文件路径
  dbPath: string;           // SQLite 数据库路径
  functionsDir: string;     // Functions 文件目录
  uiDir: string;            // UI 静态文件目录
}

// 示例
POST /internal/apps/todo/start
{
  "mode": "stable",
  "dbPath": "/workspace/data/apps/todo/db.sqlite",
  "functionsDir": "/workspace/data/apps/todo/functions",
  "uiDir": "/workspace/data/apps/todo/ui/dist"
}
```

**APP 生命周期状态**:

```
                  start
  (not loaded) ──────────▶ (running)
                                │
                  restart        │  stop
                  (stop+start)  │
                       ▲        ▼
                       └── (stopped) ──start──▶ (running)
```

- **not loaded**: Runtime 不知道这个 APP 的存在
- **running**: DB 连接就绪、函数可执行、UI 可访问
- **stopped**: DB 连接关闭、缓存清除、请求返回 503

**理由**:
- 所有通信走 HTTP，接口形态在同进程和分进程下完全一致
- 每个 APP 有独立的管理接口，粒度精确
- Runtime 是纯粹的执行者——不主动发现 APP，只响应 Daemon 指令

### Decision 3: APP 发现机制 —— Daemon 主动下发

**选择**: Runtime 不读取 Platform DB，也不扫描文件系统。所有 APP 信息由 Daemon 通过 `/internal/apps/:name/start` 下发。

**启动流程**:

```
Daemon 启动
  │
  ├── 1. 初始化 Platform DB
  ├── 2. 读取 apps 表，获取所有 APP 及其状态
  ├── 3. 创建 Runtime (同进程 mount)
  ├── 4. 遍历需要运行的 APP:
  │       ├── POST /internal/apps/todo/start  (stable)
  │       │   body: { mode: "stable", dbPath: "...", functionsDir: "...", uiDir: "..." }
  │       ├── POST /internal/apps/blog/start  (stable)
  │       └── ...
  ├── 5. 如果有 draft 状态的 APP:
  │       ├── POST /internal/apps/todo/start  (draft)
  │       │   body: { mode: "draft", dbPath: "...", functionsDir: "...", uiDir: "..." }
  │       └── ...
  └── 6. 开始接受外部请求
```

**新增 APP 时**:
```
Daemon 收到 POST /api/v1/apps (创建 APP)
  │
  ├── 写入 Platform DB
  ├── 初始化 APP 文件
  └── POST /internal/apps/new-app/start  → Runtime 加载新 APP
```

**删除 APP 时**:
```
Daemon 收到 DELETE /api/v1/apps/:name
  │
  ├── POST /internal/apps/todo/stop  → Runtime 卸载 APP
  ├── 清理文件系统
  └── 删除 Platform DB 记录
```

**Reconcile 后**:
```
Daemon 收到 POST /draft/apps/todo/reconcile
  │
  ├── 执行 DraftReconciler.reconcile()
  │   (重建 draft DB, 导出 functions/UI 到 draft 目录)
  └── POST /internal/apps/todo/restart
      body: { mode: "draft", dbPath: "draft/.../db.sqlite", ... }
      → Runtime 重新加载 draft 版本的 todo APP
```

**Publish 后**:
```
Daemon 收到 POST /draft/apps/todo/publish
  │
  ├── 执行 Publisher.publish()
  │   (迁移 DB, 导出 functions/UI 到 stable 目录)
  ├── POST /internal/apps/todo/restart
  │   body: { mode: "stable", dbPath: "data/.../db.sqlite", ... }
  │   → Runtime 重新加载 stable 版本的 todo APP
  ├── POST /internal/apps/todo/stop  (draft)
  │   → 停止 draft 版本（如果有）
  └── 返回结果
```

**理由**:
- **单一数据源**: Platform DB 是 APP 信息的唯一 source of truth，只有 Daemon 读写它
- **Runtime 无状态依赖**: Runtime 不需要知道 Platform DB 的 schema 或位置，降低耦合
- **显式优于隐式**: Daemon 明确告诉 Runtime 启动哪些 APP 以及它们的配置，而不是 Runtime 自己去猜测
- **便于未来分进程**: 分进程后 Runtime 无法访问 Daemon 的 Platform DB，这个设计天然兼容

### Decision 4: Runtime → Daemon 通信 —— 认证回调

**选择**: Runtime 需要验证用户请求时，通过 HTTP 调用 Daemon 的认证接口

**Daemon 认证接口**:
```
POST /internal/auth/verify
  Headers: Authorization: Bearer <token>
  Response: { authenticated: true, user: { id, name, role } }
           | { authenticated: false, error: "..." }
```

**Runtime 认证中间件**:
```typescript
// packages/runtime/src/middleware/auth.ts
async function authMiddleware(c, next) {
  const token = c.req.header('Authorization');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  // 调用 Daemon 的认证接口
  const result = await daemonClient.verifyAuth(token);
  if (!result.authenticated) return c.json({ error: result.error }, 401);

  c.set('user', result.user);
  await next();
}
```

**daemonClient 的实现**:
```typescript
// 同进程: 通过 Hono app.request()
const daemonClient = {
  verifyAuth: async (token) => {
    const res = await daemonApp.request('/internal/auth/verify', {
      method: 'POST',
      headers: { 'Authorization': token },
    });
    return res.json();
  }
};

// 分进程: 通过 HTTP fetch
const daemonClient = {
  verifyAuth: async (token) => {
    const res = await fetch('http://localhost:3000/internal/auth/verify', {
      method: 'POST',
      headers: { 'Authorization': token },
    });
    return res.json();
  }
};
```

**理由**:
- 认证是管理层关注点，实现细节（JWT/Session/OAuth）封装在 Daemon 内
- Runtime 只需调用一个 HTTP 接口，不依赖任何认证库
- 接口形态在同进程和分进程下一致

### Decision 5: Runtime 内部的 APP 注册表

**选择**: Runtime 维护内存中的 APP 注册表，记录每个 APP 的状态和资源

```typescript
// Runtime 内部状态
interface AppEntry {
  name: string;
  mode: 'stable' | 'draft';
  status: 'running' | 'stopped';
  dbPath: string;
  functionsDir: string;
  uiDir: string;

  // 运行时资源
  db: Database | null;           // SQLite 连接
  moduleCache: Map<string, any>; // 函数模块缓存
}

// APP 注册表
// key 格式: "{appName}:{mode}" (如 "todo:stable", "todo:draft")
const apps = new Map<string, AppEntry>();
```

**同一个 APP 可以同时存在 stable 和 draft 两个实例**:
```
apps:
  "todo:stable"  → { status: "running", dbPath: "data/apps/todo/db.sqlite", ... }
  "todo:draft"   → { status: "running", dbPath: "draft/apps/todo/db.sqlite", ... }
  "blog:stable"  → { status: "running", dbPath: "data/apps/blog/db.sqlite", ... }
```

**路由解析**: 请求 `/stable/apps/todo/fn/list` → 查找 key `"todo:stable"` → 使用对应的 DB 和函数目录。

**理由**: 注册表让 Runtime 对 APP 的管理有明确的数据结构。stable/draft 分开注册，复用同样的启动/停止逻辑。

### Decision 6: Runtime 的对外路由结构

**选择**: Runtime 暴露完整的 APP 运行时路由

```
Runtime 对外路由 (Daemon mount 后由客户端访问):

  # APP UI
  /apps/:name/                  → UI 首页 (index.html)
  /apps/:name/assets/*          → UI 静态资源
  /apps/:name/ui.json           → UI Schema

  # APP Functions
  /apps/:name/fn/:fnName        → Functions 执行 (所有 HTTP 方法)

  # APP DB CRUD
  /apps/:name/db/schema         → DB Schema 查询
  /apps/:name/db/_sql            → Raw SQL 执行
  /apps/:name/db/:table          → Table CRUD (GET list, POST create)
  /apps/:name/db/:table/:id      → Record CRUD (GET, PATCH, DELETE)

Runtime 内部管理路由 (仅 Daemon 调用):

  POST /internal/apps/:name/start
  POST /internal/apps/:name/stop
  POST /internal/apps/:name/restart
  GET  /internal/apps/:name/status
  GET  /internal/health
  POST /internal/shutdown
```

**Daemon 的 mount 方式**:
```
Daemon 路由                              → 转到
/stable/apps/:name/*                     → Runtime 对外路由 (mode=stable)
/draft/apps/:name/*                      → Runtime 对外路由 (mode=draft)
/apps/:name/*                            → Runtime 对外路由 (默认 stable)

/api/v1/*                                → Daemon 自己处理
/admin/*                                 → Daemon serve Admin SPA
```

### Decision 7: APP UI 独立 + iframe 嵌入

**选择**: 每个 APP 自带完整 UI（SchemaRenderer 打包在内），Admin 通过 iframe 嵌入

**架构**:
```
┌────────────────────────────────────────────┐
│  CozyBase Admin (/admin/)                   │
│                                            │
│  ┌─ 导航栏 ─────────────────────────────┐ │
│  │  CozyBase    [todo] [blog] [settings] │ │
│  └───────────────────────────────────────┘ │
│                                            │
│  ┌─ 内容区 ─────────────────────────────┐ │
│  │ <iframe src="/apps/todo/"></iframe>    │ │
│  │                                       │ │
│  │   APP 自己的完整 UI                   │ │
│  │   (SchemaRenderer 在 iframe 内渲染)   │ │
│  │                                       │ │
│  └───────────────────────────────────────┘ │
└────────────────────────────────────────────┘
```

**postMessage 协议**:
```typescript
// Admin → APP
type AdminToApp =
  | { type: 'theme-update'; payload: ThemeConfig }
  | { type: 'auth-token'; payload: string }
  | { type: 'navigate'; payload: { pageId: string } }

// APP → Admin
type AppToAdmin =
  | { type: 'title-changed'; payload: string }
  | { type: 'navigation-changed'; payload: string }
  | { type: 'resize'; payload: { height: number } }
  | { type: 'notification'; payload: NotificationData }
```

**风格统一**: 共享 CSS Variables，Admin 通过 postMessage 传递主题配置给 APP iframe。

**理由**: iframe 提供完全隔离，APP 可独立访问也可嵌入 Admin。

### Decision 8: npm 依赖管理 —— Bun Workspace

**选择**: Workspace 模式，公共依赖提升到 workspace 根目录

**目录结构**:
```
workspace/
  package.json                   ← workspace 配置 + 公共依赖
  node_modules/                  ← 公共依赖
    react/
    @cozybase/ui/
    ...
  data/apps/
    todo/
      package.json               ← APP 特有依赖（可选）
      node_modules/              ← 仅冲突依赖
      ...
    blog/
      package.json
      ...
```

**模块解析**: 标准 Node 解析算法向上查找 `node_modules`。

**理由**: 公共依赖只装一份；APP 可以声明特有依赖；`bun install` 在 workspace 根执行一次即可。

### Decision 9: 预留 Dashboard 聚合接口

**选择**: 定义 APP 可选的 `_dashboard.ts` 约定接口，当前不实现 Dashboard

```typescript
// functions/_dashboard.ts
export async function GET(ctx: FunctionContext) {
  return {
    summary: {
      label: "待办事项",
      icon: "checklist",
      stats: [
        { label: "总任务", value: 42 },
        { label: "已完成", value: 28 },
      ]
    }
  };
}
```

**理由**: 以下划线开头的函数不暴露为普通 API endpoint（已有约定）。Daemon 未来可聚合调用各 APP 的此接口展示 Dashboard。

## 完整通信架构

```
┌─────────────────────────────────────────────┐
│  packages/daemon                            │
│                                             │
│  Platform DB  Reconciler  Publisher   Auth  │
│       │            │          │        ▲    │
│       │            │          │        │    │
│       ▼            ▼          ▼        │    │
│  ┌─────────── HTTP 接口 ──────────────┐     │
│  │ POST /internal/apps/:name/start    │     │
│  │ POST /internal/apps/:name/stop     │     │
│  │ POST /internal/apps/:name/restart  │     │
│  └──────────────┬─────────────────────┘     │
│                 │                     ▲     │
│                 │ Daemon → Runtime    │     │
│                 │ (app.request)       │     │
│                 │                     │     │
│                 │  Runtime → Daemon   │     │
│                 │  (app.request)      │     │
│                 ▼                     │     │
│  ┌──────────────────────────────────────┐   │
│  │  packages/runtime                    │   │
│  │                                      │   │
│  │  APP 注册表   Functions   DB CRUD     │   │
│  │  /internal/*  /fn/*       /db/*      │   │
│  │                                      │   │
│  │  POST /internal/auth/verify ─────────┘   │
│  │  (Runtime 向 Daemon 验证认证)              │
│  └──────────────────────────────────────┘   │
│                                             │
│  mount: app.route('/stable', runtime)       │
│  mount: app.route('/draft', runtime)        │
└─────────────────────────────────────────────┘

未来 (分进程):
  Daemon (Rust/Zig)  ──HTTP──▶  Runtime (Bun 独立进程)
  接口不变，只是传输方式从 app.request() 变为 fetch()
```

## 代码迁移映射

当前 `packages/server` 模块到新包的映射：

```
packages/server/src/                    → 迁移到
────────────────────────                  ────────
server.ts (路由注册、静态serve)           → daemon
config.ts                               → daemon
index.ts (启动入口)                      → daemon
middleware/app-resolver.ts               → runtime (适配为从注册表查找 APP)
modules/functions/direct-runtime.ts      → runtime (重构为注册表驱动)
modules/functions/routes.ts              → runtime
modules/functions/context.ts             → runtime
modules/functions/database-client.ts     → runtime
modules/functions/logger.ts              → runtime
modules/db/routes.ts                     → runtime
modules/db/crud-handler.ts              → runtime
modules/db/query-builder.ts             → runtime
modules/ui/routes.ts                    → runtime
core/draft-reconciler.ts                → daemon
core/publisher.ts                       → daemon (publish 后调用 restart API)
core/file-export.ts                     → daemon
core/workspace.ts                       → daemon
core/platform-db.ts                     → daemon
core/app-context.ts                     → runtime (重构为 AppEntry)
```

## Risks / Trade-offs

**[拆分带来的重构成本]** → 需要搬迁代码、调整 import 路径、处理共享类型。缓解措施：大部分是机械性的代码搬迁，逻辑不变。

**[同进程 HTTP 调用的开销]** → `app.request()` 虽然不走网络，但构造 Request/Response 对象有少量开销。缓解措施：管理 API 调用频率很低（启动/重启），可忽略不计。

**[内部 API 安全]** → `/internal/*` 路由在同进程下无需额外保护，但分进程后需要确保只有 Daemon 可以调用。缓解措施：分进程时通过 localhost 绑定 + 内部 token 保护。

**[iframe 限制]** → 全屏 API、剪贴板等受限。缓解措施：APP 可脱离 Admin 独立访问。

**[单进程共享风险]** → 当前阶段 APP 仍共享进程。缓解措施：本地开发工具场景可接受；未来可拆分进程。

## Open Questions

- **APP UI 构建时机**: reconcile/publish 时自动构建？还是单独的构建步骤？用 Bun.build 还是 Vite？
- **共享类型放在哪**: 创建 `packages/shared`？还是 runtime 定义接口由 daemon 依赖？
- **Runtime 的日志格式**: 是否需要统一的结构化日志格式？
- **热重载体验**: 开发模式下 APP 代码变更后的重载机制？
