# 源码导读

## 目录结构

```
packages/server/src/
├── index.ts                    # 入口：启动 Bun.serve，注册 SIGINT 处理
├── server.ts                   # Hono 应用工厂：组装中间件、路由、初始化 reconcile
├── config.ts                   # CLI 参数解析 + 环境变量 → Config 对象
│
├── core/                       # 核心引擎层
│   ├── db-pool.ts              # SQLite 连接池 (platform DB + App DBs)
│   ├── workspace.ts            # Workspace 目录扫描器 + YAML/Zod 解析
│   ├── reconciler.ts           # Diff + Apply 引擎
│   ├── watcher.ts              # fs.watch 文件监听 + debounce
│   ├── event-bus.ts            # 内存 pub/sub 事件总线
│   ├── auth.ts                 # JWT 创建/验证 + API Key 验证
│   └── errors.ts               # 错误类层级 (AppError → NotFoundError 等)
│
├── middleware/                  # Hono 中间件
│   ├── logger.ts               # 请求日志 (method path status time)
│   ├── auth.ts                 # Bearer JWT / X-API-Key 认证
│   └── app-resolver.ts         # 从 URL 提取 appName，验证 App 存在
│
└── modules/                     # 业务模块
    ├── apps/
    │   ├── routes.ts            # 平台路由 (GET /status, POST /reconcile)
    │   └── manager.ts           # AppManager (v1 遗留，当前未使用)
    │
    └── db/
        ├── routes.ts            # Auto CRUD 路由 (GET/POST/PATCH/DELETE)
        ├── query-builder.ts     # URL 查询参数 → 参数化 SQL
        ├── schema.ts            # Schema 内省 (PRAGMA) + DDL 执行
        └── sql.ts               # Raw SQL 执行 + 安全检查
```

## 模块关系

```
index.ts
  └── createServer(config)                    [server.ts]
        │
        ├── new DbPool(config)                [core/db-pool.ts]
        │     ├── getPlatformDb()             → cozybase.sqlite
        │     └── getAppDb(appName)           → apps/{name}/db.sqlite
        │
        ├── new Reconciler(dbPool, config)     [core/reconciler.ts]
        │     ├── reconcileAll()              → 全量同步
        │     │     └── scanWorkspace()       [core/workspace.ts]
        │     └── reconcileApp(app)           → 单 App 同步
        │
        ├── new WorkspaceWatcher(dir, reconciler) [core/watcher.ts]
        │     └── fs.watch → reconcileApp()
        │
        └── Hono App
              ├── CORS + Logger middleware
              │
              ├── /health
              │
              ├── /api/v1
              │     └── createAppRoutes()     [modules/apps/routes.ts]
              │           ├── GET /status
              │           └── POST /reconcile
              │
              └── /api/v1/app/:appName
                    ├── appResolver()         [middleware/app-resolver.ts]
                    └── /db
                          └── createDbRoutes() [modules/db/routes.ts]
                                ├── GET /schema
                                ├── POST /sql
                                ├── GET /:table
                                ├── GET /:table/:id
                                ├── POST /:table
                                ├── PATCH /:table/:id
                                └── DELETE /:table/:id
```

## 关键数据流

### 1. 启动 Reconcile 流程

```
index.ts: createServer(config)
  │
  ▼
server.ts: dbPool.getPlatformDb()           → 创建/打开 cozybase.sqlite
  │                                            初始化 apps, resource_state 等表
  ▼
server.ts: reconciler.reconcileAll()
  │
  ▼
reconciler.ts: scanWorkspace(workspaceDir)
  │
  ▼
workspace.ts:
  ├── readdirSync() 扫描目录
  ├── 找到 app.yaml → 识别为 App
  ├── parseYAML() 解析 app.yaml
  ├── 遍历 tables/*.yaml
  │     └── Zod TableSpecSchema.parse()
  └── 返回 AppDefinition[]
  │
  ▼
reconciler.ts: for each app:
  ├── 检查 apps 表 → INSERT if new
  ├── for each table spec:
  │     ├── hashContent(yaml_content)
  │     ├── 查询 resource_state.spec_hash
  │     ├── hash 相同 → skip
  │     ├── PRAGMA table_info → currentColumns
  │     ├── 表不存在 → createTable() → CREATE TABLE ...
  │     ├── 表已存在 → diffAndMigrateTable() → ALTER TABLE ADD COLUMN ...
  │     ├── reconcileIndexes() → CREATE/DROP INDEX
  │     └── INSERT OR REPLACE INTO resource_state
  └── 输出变更列表
```

### 2. HTTP 请求处理流程

```
Request: POST /api/v1/app/todo-app/db/todos
  │
  ▼
Hono Middleware Chain:
  │
  ├── cors()                    → 添加 CORS headers
  ├── logger()                  → 记录 method + path
  ├── appResolver(config)       → 检查 workspace/todo-app/app.yaml 存在
  │                                设置 c.set('appName', 'todo-app')
  │
  ▼
db/routes.ts: POST /:table handler
  │
  ├── validateTableName('todos')     → 正则检查
  ├── dbPool.getAppDb('todo-app')    → 获取/创建 SQLite 连接
  ├── assertTableExists(db, 'todos') → 查 sqlite_master
  ├── getPrimaryKey(db, 'todos')     → PRAGMA table_info，找 pk=1 的列
  ├── body.id = nanoid(12)           → 自动生成 ID (如果未提供)
  ├── db.query(INSERT ...).run()     → 执行插入
  ├── db.query(SELECT ...).get()     → 读回完整记录
  ├── emitChange(...)                → EventBus 发布变更事件
  │
  ▼
Response: 201 { data: { id: "abc123", title: "...", ... } }
```

### 3. Watcher 变更检测流程

```
文件变更: my-workspace/todo-app/tables/todos.yaml 被编辑保存
  │
  ▼
watcher.ts: fs.watch callback
  ├── filename = "todo-app/tables/todos.yaml"
  ├── extractAppName() → "todo-app"
  ├── changedApps.add("todo-app")
  └── scheduleReconcile()
        │
        ▼ (500ms debounce)
        │
  watcher.ts: debounce 触发
  ├── apps = ["todo-app"]
  ├── loadAppDefinition("todo-app", workspaceDir + "/todo-app")
  │     └── 重新解析 app.yaml + tables/*.yaml
  └── reconciler.reconcileApp(app)
        ├── hash("todos.yaml 新内容") !== stored hash
        ├── PRAGMA table_info → 发现缺少 priority 列
        ├── ALTER TABLE todos ADD COLUMN priority INTEGER DEFAULT 0
        └── UPDATE resource_state SET spec_hash = new_hash
              │
              ▼
        Console: ✓ [todo-app] alter_table: todos (+column: priority)
```

## 关键类和接口

### Config (config.ts)

```typescript
interface Config {
  port: number;          // HTTP 端口 (default: 3000)
  host: string;          // 绑定地址 (default: "0.0.0.0")
  dataDir: string;       // 数据目录 (default: "./data")
  workspaceDir: string;  // Workspace 目录 (default: "./workspace")
  jwtSecret: string;     // JWT 签名密钥
}
```

配置优先级: CLI args > 环境变量 > 默认值

### DbPool (core/db-pool.ts)

```typescript
class DbPool {
  getPlatformDb(): Database;        // cozybase.sqlite
  getAppDb(appName: string): Database;  // apps/{name}/db.sqlite
  closeAppDb(appName: string): void;
  closeAll(): void;
}
```

- 所有数据库默认启用 `PRAGMA journal_mode = WAL` 和 `PRAGMA foreign_keys = ON`
- 连接按 appName 缓存在内存 Map 中
- Platform DB 初始化 4 个表: apps, platform_users, api_keys, resource_state

### AppDefinition (core/workspace.ts)

```typescript
interface AppDefinition {
  name: string;                              // 目录名
  dir: string;                               // 绝对路径
  spec: AppSpec;                             // app.yaml 内容
  tables: Map<string, { spec: TableSpec; content: string }>;
  functions: string[];                       // 函数名列表
}
```

### Reconciler (core/reconciler.ts)

```typescript
class Reconciler {
  reconcileAll(): ReconcileChange[];         // 全量 reconcile
  reconcileApp(app: AppDefinition): ReconcileChange[];  // 单 App
}

interface ReconcileChange {
  app: string;                               // App 名称
  type: 'create_app' | 'create_table' | 'alter_table' | ...;
  resource: string;                          // 资源名
  detail?: string;                           // 变更细节
  warning?: boolean;                         // 是否为警告
}
```

### WorkspaceWatcher (core/watcher.ts)

```typescript
class WorkspaceWatcher {
  start(): void;    // 开始监听
  stop(): void;     // 停止监听并清理 timer
}
```

### EventBus (core/event-bus.ts)

```typescript
// 发布
eventBus.emit('db:todo-app:todos', changeEvent);

// 订阅
eventBus.on('db:todo-app:todos', (event) => { ... });
eventBus.on('*', (event) => { ... });  // 通配符

interface ChangeEvent {
  appId: string;
  table: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, unknown>;
  oldRecord?: Record<string, unknown>;
}
```

## 遗留代码说明

### modules/apps/manager.ts

v1 架构的 AppManager，提供命令式 App CRUD 操作。v2 中 App 由 workspace 目录管理，此文件不再被 server.ts 引用。保留原因：将来可能部分功能（如 App 元数据更新）仍需使用。
