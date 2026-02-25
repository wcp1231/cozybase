## Context

当前系统由以下核心组件组成：

- **Config** (`config.ts`)：解析 CLI 参数，提供 `workspaceDir` 和 `dataDir` 两个独立路径
- **DbPool** (`core/db-pool.ts`)：全局数据库连接池，管理 platform DB 和所有 app DB，内部硬编码路径拼接逻辑
- **workspace.ts**：纯函数式模块，`scanWorkspace()` 扫描 workspaceDir 下的 app.yaml，返回 `AppDefinition[]`
- **Reconciler** (`core/reconciler.ts`)：依赖 DbPool + Config，遍历所有 app 进行 diff & apply
- **WorkspaceWatcher** (`core/watcher.ts`)：监听文件变更，debounce 后触发 reconcile
- **app-resolver middleware**：通过检查 `app.yaml` 是否存在来验证 app，只设置 `appName` 字符串
- **DB Routes**：每个 handler 都通过 `dbPool.getAppDb(appName)` 获取数据库连接
- **AppManager** (`modules/apps/manager.ts`)：依赖 DbPool + Config 管理 app CRUD

主要问题：路径逻辑分散、app 资源无隔离、无 workspace 身份、无变更历史。

## Goals / Non-Goals

**Goals:**

- 建立 Workspace 作为系统的顶层抽象，统一管理声明目录、数据目录、Git 操作
- 引入 AppContext 实现 per-app 资源隔离，每个 app 的 db/paths 由自己的 context 封装
- 支持 workspace 自动初始化（目录结构 + git init + 示例 app）
- reconcile 成功后自动 git commit，记录声明变更历史
- 移除 WorkspaceWatcher，reconcile 改为显式触发

**Non-Goals:**

- 多 workspace 支持
- data 目录外挂到独立路径
- Git 分支管理
- Functions/Storage 模块的完整实现（只预留 AppContext 接口）

## Decisions

### 1. Workspace 类作为系统核心入口

**决策**：创建 `Workspace` 类替代当前分散的路径逻辑和函数式 scanner，成为 Reconciler、Server、Middleware 的共享依赖。

**理由**：当前路径计算分散在 Config（`workspaceDir`、`dataDir`）、DbPool（`join(config.dataDir, 'apps', appName, 'db.sqlite')`）、app-resolver（`join(config.workspaceDir, appName, 'app.yaml')`）中。统一到 Workspace 类消除了路径拼接的重复和不一致风险。

**备选方案**：保持现有的函数式 scanner + 在 Config 中增加路径方法。问题是 Config 是纯数据对象，加入行为会模糊其职责。

**核心接口**：

```typescript
class Workspace {
  readonly root: string;         // workspace 根路径
  readonly appsDir: string;      // root/apps
  readonly dataDir: string;      // root/data

  private platformDb: Database | null;
  private apps: Map<string, AppContext>;

  // 生命周期
  init(): void;                  // 创建目录/git/示例 app
  load(): void;                  // 解析 workspace.yaml
  close(): void;                 // 关闭所有资源

  // App 管理
  scanApps(): AppDefinition[];
  getApp(name: string): AppContext | undefined;
  getOrCreateApp(name: string): AppContext;

  // Platform DB
  getPlatformDb(): Database;

  // Git
  commit(message: string): void;
}
```

### 2. AppContext 封装 per-app 资源

**决策**：每个 app 拥有独立的 `AppContext` 实例，封装该 app 的路径、DB 连接和定义。DB 连接懒初始化——首次访问 `db` getter 时才创建。

**理由**：当前所有 route handler 都要做 `const db = dbPool.getAppDb(appName)` 这个重复操作。AppContext 将 app 的所有资源集中在一处，handler 直接使用 `appContext.db`。同时为未来的 functions/storage 预留了扩展点。

**备选方案**：在 DbPool 上增加 per-app 的资源管理方法。问题是 DbPool 语义上只负责数据库连接，强行塞入 functions/storage 会造成概念混乱。

**生命周期（Hybrid 策略）**：

```
AppContext 创建时机：
1. Reconcile 时 → workspace.getOrCreateApp(name)
   创建/更新 AppContext，确保 DB 连接可用
2. HTTP 请求时 → 中间件调用 workspace.getOrCreateApp(name)
   若该 app 尚未 reconcile 但存在有效定义，懒加载 AppContext

AppContext 使用 definition 来判断有效性：
- 如果 apps/ 目录下有 app.yaml，就可以创建 AppContext
- definition 可通过 reload() 更新
```

**核心接口**：

```typescript
class AppContext {
  readonly name: string;
  readonly workspace: Workspace;

  // 路径（只读，从 workspace 派生）
  readonly specDir: string;      // workspace.appsDir/name
  readonly dataDir: string;      // workspace.dataDir/apps/name
  readonly dbPath: string;       // dataDir/db.sqlite

  // 声明定义
  private _definition: AppDefinition;
  get definition(): AppDefinition;
  reload(def: AppDefinition): void;

  // 资源（懒初始化）
  private _db: Database | null;
  get db(): Database;            // 首次访问时创建连接

  // 生命周期
  init(): void;                  // 创建 dataDir，确保目录存在
  close(): void;                 // 关闭 DB 连接
}
```

### 3. 移除 DbPool，DB 连接分散到 Workspace 和 AppContext

**决策**：删除 `core/db-pool.ts`。Platform DB 由 Workspace 管理，app DB 由各自的 AppContext 管理。

**理由**：DbPool 的核心价值是连接缓存和路径管理。在新架构中：
- 路径管理已由 Workspace/AppContext 负责
- 连接缓存由 `Workspace.apps` Map 和 `AppContext._db` 实现
- Platform DB 是 workspace 级别的单例，由 Workspace 直接持有

DbPool 不再有独立存在的理由。

**Platform Schema 初始化**：当前在 `DbPool.initPlatformSchema()` 中，迁移到 `Workspace.initPlatformDb()` 私有方法。Schema 不变——`apps`、`platform_users`、`api_keys`、`resource_state` 四张表保持原样。

### 4. 移除 WorkspaceWatcher

**决策**：删除 `core/watcher.ts`。Reconcile 完全由 AI/用户通过 API（`POST /api/v1/reconcile`）或 CLI 显式触发。

**理由**：在 AI agent 驱动的使用场景中，变更由 AI 主导——AI 修改 YAML、触发 reconcile、确认结果。文件监听是多余的中间层，还会引入 debounce timing 等复杂性。

### 5. Git Auto-Commit 策略

**决策**：`Workspace.commit(message)` 方法在 reconcile 成功后被调用，执行 `git add apps/ && git commit -m "message"`。每次 reconcile 调用一次 commit。

**理由**：保持实现简单。因为 reconcile 是显式触发的（不再有 watcher 的高频 debounce 问题），每次 reconcile 产生一个 commit 是合理的频率。

**实现细节**：
- 使用 `Bun.spawn()` 调用 git CLI
- commit message 自动生成，包含 reconcile 的变更摘要
- 如果 `apps/` 没有实际文件变更（git status 干净），跳过 commit
- git 命令失败不阻塞 reconcile 流程，只打印警告

**备选方案**：使用 isomorphic-git（纯 JS git 实现）。问题是增加依赖复杂度，且 Bun.spawn 调用 git CLI 足够简单可靠。

### 6. Workspace 自动初始化

**决策**：server 启动时检查 `workspace.yaml` 是否存在。不存在则执行完整初始化。

**初始化步骤**：
1. 创建目录：`root/`、`root/apps/`、`root/data/`
2. 写入 `workspace.yaml`：`{ name: "cozybase", version: 1 }`
3. 写入 `.gitignore`：忽略 `data/`、`*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`
4. 执行 `git init`（在 workspace root 下）
5. 创建示例 app：`apps/hello/app.yaml`（内容：`description: "Hello World"`）
6. 执行初始 commit：`git add . && git commit -m "init workspace"`

### 7. Config 简化

**决策**：`Config` 移除 `dataDir` 字段和 `--data` CLI 参数。`workspaceDir` 默认值从 `'.'` 改为 `$HOME/.cozybase`（通过 `os.homedir()` 获取）。

```typescript
interface Config {
  port: number;
  host: string;
  workspaceDir: string;   // 默认 $HOME/.cozybase
  jwtSecret: string;
}
```

**理由**：data 路径不再独立——它是 workspace 的固定子目录。Config 只保留运行时参数。

### 8. Middleware 和 Routes 适配

**决策**：`appResolver` 中间件从 Workspace 获取 AppContext 并注入到 Hono context。所有 route handler 从 `c.get('appContext')` 获取 AppContext。

**当前流程**：
```
request → appResolver(config) → 检查 app.yaml 存在 → set('appName', string) → handler → dbPool.getAppDb(appName)
```

**新流程**：
```
request → appResolver(workspace) → workspace.getOrCreateApp(name) → set('appContext', AppContext) → handler → appContext.db
```

**类型定义更新**：

```typescript
// 当前
type AppEnv = { Variables: { appName: string } };

// 新
type AppEnv = { Variables: { appContext: AppContext } };
```

### 9. Reconciler 适配

**决策**：Reconciler 构造函数接收 `Workspace` 替代 `DbPool + Config`。

**当前**：
```typescript
class Reconciler {
  constructor(private dbPool: DbPool, private config: Config) {}
  reconcileAll() {
    const apps = scanWorkspace(this.config.workspaceDir);
    // ...
    const db = this.dbPool.getAppDb(app.name);
  }
}
```

**新设计**：
```typescript
class Reconciler {
  constructor(private workspace: Workspace) {}
  reconcileAll() {
    const apps = this.workspace.scanApps();
    // ...
    const appContext = this.workspace.getOrCreateApp(app.name);
    const db = appContext.db;
    // reconcile 完成后
    this.workspace.commit("reconcile: ...");
  }
}
```

Platform DB 通过 `this.workspace.getPlatformDb()` 获取。

### 10. AppManager 适配

**决策**：`AppManager` 依赖从 `DbPool + Config` 改为 `Workspace`。

当前 AppManager 使用 `dbPool.getPlatformDb()` 查询平台 DB，使用 `config.dataDir` 创建 app 数据目录。新设计中改为 `workspace.getPlatformDb()` 和 `workspace.getOrCreateApp(name)` 获取路径。

### 11. YAML Scanner 保留为 Workspace 的内部方法

**决策**：当前 `workspace.ts` 中的 Zod schema 定义（`ColumnSchema`、`TableSpecSchema`、`AppSpecSchema` 等）和 `scanWorkspace()`/`loadAppDefinition()` 逻辑保留，但从独立导出函数变为 Workspace 类的实例方法。`hashContent()` 保持为独立工具函数。

**类型导出**：`AppDefinition`、`TableSpec`、`ColumnSpec`、`IndexSpec` 等类型继续从 workspace 模块导出，供 Reconciler 和其他模块使用。

## Risks / Trade-offs

**[Git 依赖]** → workspace 自动初始化和 auto-commit 依赖系统安装 git。若 git 不可用，init 时跳过 git init，commit 时打印警告但不阻塞流程。

**[Platform Schema 迁移]** → `initPlatformSchema()` 从 DbPool 移到 Workspace，逻辑不变但调用时机改变（从首次 `getPlatformDb()` 变为 `Workspace.load()` 中显式初始化）。需要确保 platform DB 在 Reconciler 和 AppManager 使用前已初始化。解决方案：`Workspace.load()` 内部调用 `getPlatformDb()` 确保初始化。

**[现有 my-workspace/ 失效]** → 当前示例 workspace 直接在根目录下放 app 文件夹（`my-workspace/todo-app/`），新结构要求 app 在 `apps/` 子目录下（`workspace/apps/todo-app/`）。解决方案：更新或删除 `my-workspace/`，用自动生成的 `$HOME/.cozybase` 替代。

**[Breaking change for existing users]** → `--data` 参数移除，`--workspace` 默认值改变。这是 v0.1.0 阶段的变更，尚无外部用户，影响可控。
