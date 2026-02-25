## Why

重新设计 Workspace 管理架构，将当前分离的 definitions（workspaceDir）和 data（dataDir）统一为一个自包含的 Workspace 概念，引入 AppContext 实现 per-app 资源隔离，并集成 Git 自动提交功能。

### 背景与动机

当前架构中，应用定义（YAML specs）和运行时数据（SQLite databases）通过 `--workspace` 和 `--data` 两个独立参数指定路径，分散在不同位置。这导致：

- 没有统一的 workspace 身份概念
- 路径逻辑散布在 Config、workspace.ts、db-pool.ts 中
- 每个 app 的资源（db、functions、storage）由全局 DbPool 横向管理，缺乏 per-app 隔离
- 没有变更历史记录能力

### 设计决策

1. **Unified Workspace**：workspace 是一个自包含目录（默认 `$HOME/.cozybase`），包含 `apps/`（声明，git tracked）和 `data/`（运行时产物，git ignored）
2. **workspace.yaml**：精简配置文件，MVP 只有 name + version（schema version）
3. **Workspace 类**：统一管理路径、Git 操作、platform DB、AppContext 注册表
4. **AppContext（per-app 资源隔离）**：每个 app 有自己的 AppContext，封装 db 连接、（未来的）functions runner、storage manager。采用 Hybrid 策略——reconcile 时创建/更新，首次请求时也可懒加载
5. **移除 WorkspaceWatcher**：不再使用文件监听，reconcile 由 AI/用户显式触发
6. **Git Level 2**：reconcile 成功后自动 `git add apps/ && git commit`，记录变更历史
7. **自动初始化**：启动时若 workspace 不存在则自动创建目录结构、git init、生成示例 app
8. **Functions 是声明**：`.ts` 文件在 `apps/` 目录下，开发者用平台 SDK 编写，git tracked
9. **DbPool 重构**：不再作为全局连接池，path 逻辑移入 Workspace/AppContext，DB 连接由 AppContext 持有

## What Changes

### New: Workspace 类 (`packages/server/src/core/workspace.ts`)

重写现有文件，从纯函数式 scanner 变为 Workspace 类：

- `init()` — 自动初始化：创建目录结构、workspace.yaml、.gitignore、git init、示例 app
- `load()` — 加载 workspace.yaml，扫描 apps/ 目录
- `getApp(name)` / `getOrCreateAppContext(name)` — Hybrid 懒加载 AppContext
- `scanApps()` — 扫描 YAML 定义
- `commit(message)` — git auto-commit
- `close()` — 关闭所有资源
- 持有 platformDb 和 `apps: Map<string, AppContext>`

### New: AppContext 类 (`packages/server/src/core/app-context.ts`)

Per-app 资源容器：

- `name`, `definition` (AppDefinition)
- `db` — 该 app 的 SQLite 连接（懒初始化）
- `paths` — specDir, dataDir, dbPath, storagePath, functionsPath
- `init()` — 创建数据目录、初始化 DB
- `reload(definition)` — reconcile 时更新定义
- `close()` — 关闭所有资源

### Modify: Config (`packages/server/src/config.ts`)

- 移除 `dataDir` 字段
- `workspaceDir` 默认值改为 `$HOME/.cozybase`（当前默认 `.`）
- 保留 `port`, `host`, `jwtSecret` 等运行时配置

### Modify: Reconciler (`packages/server/src/core/reconciler.ts`)

- 依赖 Workspace 而非 DbPool + Config
- reconcile 时通过 `workspace.getOrCreateAppContext(name)` 获取 AppContext
- reconcile 成功后调用 `workspace.commit()`

### Modify: Server (`packages/server/src/server.ts`)

- 使用 Workspace 替代 DbPool + Config 组合
- 移除 WorkspaceWatcher 的初始化

### Modify: Middleware app-resolver (`packages/server/src/middleware/app-resolver.ts`)

- 从 Workspace 获取 AppContext，attach 到请求 context

### Modify: DB Routes (`packages/server/src/modules/db/routes.ts`)

- 从 `c.get('appContext').db` 获取数据库，而非 `dbPool.getAppDb()`

### Remove: WorkspaceWatcher (`packages/server/src/core/watcher.ts`)

- 暂时移除文件监听模块

### Refactor: DbPool (`packages/server/src/core/db-pool.ts`)

- 移除或大幅简化，DB 连接管理移入 AppContext
- platform DB 连接由 Workspace 管理

### Workspace 目录结构

```
$HOME/.cozybase/
├── workspace.yaml          # { name, version }
├── .gitignore              # ignores data/
├── .git/
├── apps/                   # Declarations (git tracked)
│   ├── hello/
│   │   └── app.yaml
│   ├── todo-app/
│   │   ├── app.yaml
│   │   ├── tables/
│   │   │   ├── todos.yaml
│   │   │   └── users.yaml
│   │   └── functions/
│   │       └── send-email.ts
│   └── blog-app/
│       ├── app.yaml
│       └── tables/
│           └── posts.yaml
└── data/                   # Artifacts + Runtime (git ignored)
    ├── platform.sqlite
    └── apps/
        ├── todo-app/
        │   ├── db.sqlite
        │   ├── functions/
        │   └── storage/
        └── blog-app/
            └── db.sqlite
```

## Capabilities

### New Capabilities

- `workspace-management`: 统一的 Workspace 类，管理自包含目录结构、workspace.yaml 配置、Git 自动提交、自动初始化（目录结构 + git init + 示例 app）
- `app-context`: Per-app 资源隔离容器（AppContext），封装每个 app 的 SQLite 连接、路径管理、定义加载与生命周期管理

### Modified Capabilities

<!-- 当前没有已有 spec，所有变更均作为新 capability 引入 -->

## Impact

### 受影响的代码

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/server/src/core/workspace.ts` | 重写 | 从函数式 scanner 变为 Workspace 类 |
| `packages/server/src/core/app-context.ts` | 新增 | Per-app 资源容器 |
| `packages/server/src/config.ts` | 修改 | 移除 `dataDir`，调整 `workspaceDir` 默认值 |
| `packages/server/src/core/reconciler.ts` | 修改 | 依赖 Workspace 替代 DbPool + Config |
| `packages/server/src/server.ts` | 修改 | 使用 Workspace 替代旧组合 |
| `packages/server/src/middleware/app-resolver.ts` | 修改 | 从 Workspace 获取 AppContext |
| `packages/server/src/modules/db/routes.ts` | 修改 | 从 AppContext 获取 db 连接 |
| `packages/server/src/core/watcher.ts` | 移除 | 暂时移除文件监听 |
| `packages/server/src/core/db-pool.ts` | 重构 | DB 连接管理移入 AppContext |

### API 影响

- REST API 路由行为不变，内部从 DbPool 切换到 AppContext 获取数据库连接
- 启动参数变更：移除 `--data` 参数，`--workspace` 默认值变为 `$HOME/.cozybase`

### 依赖

- 系统需安装 git（Git auto-commit 功能依赖）

### 不在范围内

- 多 workspace 支持
- Data 目录外挂到其他路径
- Git 分支管理（只记录线性历史）
- Functions/Storage 模块的完整实现（只预留路径和 AppContext 接口）

### 风险

- 现有 `my-workspace/` 示例目录结构会失效，需要迁移或更新文档
- Git auto-commit 需要系统安装 git
