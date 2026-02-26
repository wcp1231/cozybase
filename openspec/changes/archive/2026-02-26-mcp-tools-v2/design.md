## Context

当前 cozybase 采用 Database-first 架构，所有 APP 文件存储在 `platform.sqlite` 的 `app_files` 表中。磁盘上的文件（functions 目录）仅作为运行时导出的副本，由 `exportFunctionsFromDb()` 在 reconcile/publish 时生成。

现有的 MCP 工具类型定义（`mcp-types.ts`）基于"参数传递文件内容"的模式：Agent 通过 MCP 参数把文件内容传给工具，工具写入 DB。

本次变更引入"文件系统同步模型"：通过 `cozybase mcp` 命令提供 MCP Server，Agent 在本地工作目录中读写文件，`cozybase mcp` 负责在 Agent 工作目录与 cozybase 核心之间同步文件。

### 部署场景

| 场景 | cozybase 位置 | `cozybase mcp` 连接方式 |
|------|--------------|------------------------|
| 本地开发 | 同一台机器 | 嵌入式，直接调用内部模块 |
| Homelab | 远程服务器 | 远程，通过 HTTP API |

两种场景下 `cozybase mcp` 始终运行在 Agent 的机器上（MCP stdio 子进程），始终能访问 Agent 的本地文件系统。

### 现有可复用的基础设施

| 模块 | 位置 | 可复用方式 |
|------|------|-----------|
| `collectFiles(baseDir, prefix)` | `workspace.ts:339-357` | 扫描目录中的所有文件 |
| `importAppFromDir(appName, dir)` | `workspace.ts:302-336` | 从目录导入到 DB 的参考实现 |
| `exportFunctionsFromDb(platformDb, appName, targetDir)` | `file-export.ts:9-44` | 从 DB 导出到磁盘（需泛化为导出所有文件） |
| `assertSafeFilePath(path)` | `manager.ts:20-31` | 文件路径安全检查 |
| `AppManager.updateApp()` | `manager.ts:186-275` | 文件批量写入 DB 的事务逻辑 |
| `AppManager.updateFile()` | `manager.ts:278-313` | 单文件写入 DB 的逻辑 |

## Goals / Non-Goals

**Goals:**
- 定义 11 个 MCP 工具的完整技术方案，覆盖 App 生命周期、文件同步、开发工作流、运行时交互
- 设计 `cozybase mcp` 的双模式架构（本地嵌入 / 远程 HTTP），通过 Backend Adapter 抽象两种模式的差异
- 设计 Agent 工作目录与 cozybase 之间的文件同步机制
- 设计 `execute_sql` 的权限模型和 SQL 语句安全检查
- 设计 `call_api` 的请求路由机制

**Non-Goals:**
- MCP 协议层的具体实现细节（stdio transport 解析等）
- 多 Agent 并发操作同一 APP
- 文件系统监听（file watcher）或自动同步
- Cron / Trigger 等未来函数类型的测试工具

## Decisions

### Decision 1：`cozybase mcp` 的双模式架构

**选择：** `cozybase mcp` 通过 Backend Adapter 模式抽象两种部署方式，MCP 工具层代码对两种模式完全一致。

```
┌──────────┐  stdio    ┌──────────────────────────────────────┐
│  Agent   │◄────────▶│  cozybase mcp                        │
└──────────┘           │                                      │
                       │  ┌────────────────────────────────┐  │
     Agent 工作目录     │  │ MCP Tool Handlers              │  │
     {apps_dir}/       │  │ (11 个工具的实现)                │  │
                       │  └──────────┬─────────────────────┘  │
                       │             │                        │
                       │  ┌──────────▼─────────────────────┐  │
                       │  │ CozybaseBackend (接口)          │  │
                       │  ├────────────────────────────────┤  │
                       │  │ EmbeddedBackend │ RemoteBackend │  │
                       │  │ (本地模式)       │ (远程模式)    │  │
                       │  │ 直接调用模块     │ HTTP API      │  │
                       │  └────────────────┴───────────────┘  │
                       └──────────────────────────────────────┘
```

**Backend Adapter 接口：**
```typescript
interface CozybaseBackend {
  // App 生命周期
  createApp(name: string, description?: string): Promise<AppSnapshot>
  listApps(): Promise<AppInfo[]>
  fetchApp(name: string): Promise<AppSnapshot>
  deleteApp(name: string): Promise<void>

  // 文件同步
  pushFiles(name: string, files: FileEntry[]): Promise<PushResult>
  pushFile(name: string, path: string, content: string): Promise<void>

  // 开发工作流
  reconcile(name: string): Promise<ReconcileResult>
  verify(name: string): Promise<VerifyResult>
  publish(name: string): Promise<PublishResult>

  // 运行时交互
  executeSql(name: string, sql: string, mode: string): Promise<SqlResult>
  callApi(name: string, method: string, path: string, body?: unknown, mode?: string): Promise<ApiResponse>
}
```

**EmbeddedBackend（本地模式）：**
```typescript
class EmbeddedBackend implements CozybaseBackend {
  private workspace: Workspace
  private appManager: AppManager

  async reconcile(name) {
    return DraftReconciler.reconcile(this.workspace, name)
  }
  async executeSql(name, sql, mode) {
    const db = mode === 'draft' ? ctx.draftDb : ctx.stableDb
    return db.query(sql).all()
  }
  async callApi(name, method, path, body, mode) {
    // Hono app.request() 内部路由
    return this.app.request(`/${mode}/apps/${name}${path}`, { method, body })
  }
}
```

**RemoteBackend（远程模式）：**
```typescript
class RemoteBackend implements CozybaseBackend {
  private baseUrl: string  // e.g. http://homelab.local:2765

  async reconcile(name) {
    return fetch(`${this.baseUrl}/draft/apps/${name}/reconcile`, { method: 'POST' })
  }
  async executeSql(name, sql, mode) {
    return fetch(`${this.baseUrl}/${mode}/apps/${name}/db/_sql`, {
      method: 'POST', body: JSON.stringify({ sql })
    })
  }
  async callApi(name, method, path, body, mode) {
    return fetch(`${this.baseUrl}/${mode}/apps/${name}${path}`, { method, body })
  }
}
```

**MCP 工具层不关心后端是哪种模式：**
```typescript
async function handleReconcile(params, backend: CozybaseBackend) {
  return backend.reconcile(params.app_name)
}
```

**理由：**
- 一套工具代码覆盖两种部署方式
- 本地模式零网络开销，远程模式支持 Homelab 等场景
- Backend Adapter 是成熟的抽象模式，未来扩展新的连接方式（如 WebSocket）也容易

**替代方案：**
- 只做嵌入式 — 不支持远程部署
- 只做 HTTP — 本地场景有不必要的网络开销
- 拆成两个独立的 MCP 实现 — 工具层代码重复

### Decision 2：Agent 工作目录的管理

**选择：** Agent 工作目录由 `cozybase mcp` 管理，位置通过配置指定。每个 APP 对应一个子目录 `{apps_dir}/{app-name}/`。

**配置方式：**
```bash
cozybase mcp --apps-dir /path/to/workspace
# 或通过环境变量
COZYBASE_APPS_DIR=/path/to/workspace cozybase mcp
```

**APP 工作目录结构：**
```
{apps_dir}/{app-name}/
├── app.yaml
├── migrations/
│   ├── 001_init.sql
│   └── 002_add_users.sql
├── seeds/
│   └── init.json
├── functions/
│   ├── hello.ts
│   └── stats.ts
└── ui/
    └── pages.json
```

**理由：**
- Agent 工作目录和 cozybase 数据目录（`~/.cozybase/`）是完全独立的概念
- 通过配置指定 `apps_dir`，灵活适应不同部署环境
- MCP 进程运行在 Agent 机器上，天然能访问本地文件系统

### Decision 3：cozybase → Agent 同步（fetch/export）

**选择：** `cozybase mcp` 通过 Backend 获取 APP 文件内容，然后写入 Agent 工作目录。

**`create_app` 流程：**
```
1. backend.createApp(name, description) → 返回 AppSnapshot（含文件内容）
2. 将文件写入 {apps_dir}/{name}/
3. 返回 { name, directory, files: [路径列表] }
```

**`fetch_app` 流程：**
```
1. backend.fetchApp(name) → 返回 AppSnapshot（含文件内容）
2. 清空 Agent 工作目录 {apps_dir}/{name}/（避免残留已删除的文件）
3. 将所有文件写入 Agent 工作目录
4. 返回 { name, state, directory, files: [路径列表] }
```

**理由：**
- Backend 返回文件内容（无论是从 DB 直接读还是通过 HTTP API 获取）
- `cozybase mcp` 负责将内容写到 Agent 本地磁盘
- 先清空再写入，保证工作目录和 cozybase 完全一致
- 返回目录路径和文件名列表（不返回内容），Agent 用自身文件工具读取内容

### Decision 4：Agent → cozybase 同步（update/push）

**选择：** `cozybase mcp` 扫描 Agent 工作目录，将文件内容推送到 cozybase。

**`update_app(app_name)` 流程：**
```
1. 扫描 {apps_dir}/{app_name}/ 收集所有文件（路径 + 内容）
2. backend.pushFiles(name, files) → cozybase 在事务中同步：
   - 新增：Agent 有、DB 无
   - 修改：Agent 有、DB 有、内容不同
   - 删除：Agent 无、DB 有（且非 immutable）
   - immutable 文件内容变更则报错
3. 返回 { files: [路径列表], changes: { added, modified, deleted } }
```

**`update_app_file(app_name, path)` 流程：**
```
1. 读取 {apps_dir}/{app_name}/{path}
2. backend.pushFile(name, path, content) → UPSERT
3. 返回 { path, status: 'created' | 'updated' }
```

**理由：**
- `update_app` 是全量同步——Agent 工作目录就是 APP 的完整状态
- `update_app_file` 是单文件增量同步，适合只改了一个文件的场景
- immutable 文件保护机制不变

### Decision 5：移除乐观锁

**选择：** MCP 工具路径下不使用 `base_version`。`current_version` 仍然递增（用于 reconcile/publish 流程），但不做冲突检查。

**理由：**
- 单 Agent 操作单 APP，不存在并发冲突
- Agent 通过文件系统操作文件，工作目录就是"最新状态"
- Management API 的 `PUT /api/v1/apps/:name` 可继续保留 `base_version` 供其他客户端使用

### Decision 6：execute_sql 的安全模型

**选择：** 新增 SQL 执行能力（本地模式直接调用 DB，远程模式通过新端点 `POST /{mode}/apps/{appName}/db/_sql`），按 mode 区分权限。

**SQL 语句分类检查：**
```typescript
function classifySql(sql: string): 'select' | 'dml' | 'ddl' | 'pragma' | 'unknown' {
  const normalized = sql.trimStart().toUpperCase();

  if (/^(SELECT|WITH)\b/.test(normalized)) return 'select';
  if (/^PRAGMA\b/.test(normalized)) return 'pragma';
  if (/^EXPLAIN\b/.test(normalized)) return 'select';
  if (/^(INSERT|UPDATE|DELETE|REPLACE)\b/.test(normalized)) return 'dml';
  if (/^(CREATE|DROP|ALTER|ATTACH|DETACH)\b/.test(normalized)) return 'ddl';
  return 'unknown';
}
```

**权限矩阵：**

| 语句类型 | Draft | Stable |
|---------|-------|--------|
| SELECT / WITH / EXPLAIN | OK | OK |
| PRAGMA (只读类) | OK | OK |
| INSERT / UPDATE / DELETE / REPLACE | OK | 禁止 |
| CREATE / DROP / ALTER | 禁止 | 禁止 |
| unknown | 禁止 | 禁止 |

**服务端安全措施：**
- 结果集大小限制：最多返回 1000 行
- 执行超时：5 秒
- SQL 执行失败返回错误信息，便于 Agent 调试

**返回格式：**
```json
{
  "columns": ["id", "title", "completed"],
  "rows": [[1, "Buy milk", 0], [2, "Read book", 1]],
  "rowCount": 2
}
```

**理由：**
- 正则匹配第一个关键字简单可靠
- Draft 允许 DML 因为 Draft DB 可通过 reconcile 重建
- DDL 一律禁止，强制 schema 变更走 migration 流程
- 本地模式直接调用 DB API，SQL 分类检查在 `cozybase mcp` 工具层执行
- 远程模式需要 cozybase daemon 提供 `_sql` 端点，SQL 分类检查在服务端执行

### Decision 7：call_api 的请求路由

**选择：** `call_api` 根据 Backend 模式选择不同的路由方式。

**本地模式：**
```typescript
// 使用 Hono app.request() 内部路由
const response = await app.request(`/${mode}/apps/${name}${path}`, { method, body })
```

**远程模式：**
```typescript
// 转发 HTTP 请求到 cozybase daemon
const response = await fetch(`${baseUrl}/${mode}/apps/${name}${path}`, { method, body })
```

**理由：**
- 本地模式用 `app.request()` 避免网络开销，同时保留完整的中间件处理
- 远程模式就是标准的 HTTP 请求转发
- 两种模式对 Agent 表现一致——都是"调用 APP 的 HTTP 端点"

### Decision 8：reconcile / verify / publish 工具的封装

**选择：** 通过 Backend Adapter 封装，本地模式直接调用内部模块，远程模式调用 HTTP API。

**本地模式调用链：**
```
reconcile_app → backend.reconcile() → DraftReconciler.reconcile(workspace, name)
verify_app    → backend.verify()    → Verifier.verify(workspace, name)
publish_app   → backend.publish()   → Publisher.publish(workspace, name)
```

**远程模式调用链：**
```
reconcile_app → backend.reconcile() → POST {url}/draft/apps/{name}/reconcile
verify_app    → backend.verify()    → POST {url}/draft/apps/{name}/verify
publish_app   → backend.publish()   → POST {url}/draft/apps/{name}/publish
```

**理由：** Backend Adapter 让两种模式用同一套代码，无需条件分支。

### Decision 9：create_app 和 fetch_app 的返回值设计

**选择：** 返回 Agent 工作目录路径和文件列表（路径），不返回文件内容。Agent 通过自身的文件读取能力获取内容。

```typescript
// create_app 返回
{
  name: "todo",
  description: "Todo App",
  directory: "/path/to/workspace/todo",
  files: [
    "app.yaml",
    "migrations/001_init.sql",
    "functions/hello.ts",
    "ui/pages.json"
  ]
}

// fetch_app 返回
{
  name: "todo",
  description: "Todo App",
  state: "draft_only",
  current_version: 3,
  published_version: 0,
  directory: "/path/to/workspace/todo",
  files: [
    "app.yaml",
    "migrations/001_init.sql",
    "migrations/002_add_users.sql",
    "seeds/init.json",
    "functions/hello.ts",
    "functions/stats.ts",
    "ui/pages.json"
  ]
}
```

**文件内容的完整流转路径：**
```
fetch_app 调用时:
  Backend 返回文件内容 → cozybase mcp 写入 Agent 工作目录 → MCP 响应只含路径
  → Agent 用文件工具读取工作目录中的文件

update_app 调用时:
  Agent 用文件工具修改工作目录 → cozybase mcp 扫描工作目录读取内容 → 推送到 Backend
```

**理由：**
- MCP 响应不包含文件内容，避免响应体过大
- Agent 有原生文件读取能力，直接读工作目录效率更高
- `cozybase mcp` 在两次 MCP 调用之间充当"文件中转站"

## Risks / Trade-offs

### Risk 1：Agent 工作目录和 cozybase 不同步

**场景：** Agent 修改了文件但忘了调用 `update_app`。

**缓解：**
- 工具描述中明确提醒 Agent 修改文件后必须调用 update_app 同步
- `fetch_app` 总是从 cozybase 完整刷新到工作目录，作为"重置"手段
- 单 APP 单 Agent 的约定避免了外部并发修改

### Risk 2：SQL 语句分类检查可被绕过

**场景：** 多语句拼接 `SELECT 1; DROP TABLE users`。

**缓解：**
- SQLite 的 `db.query()` 默认只执行第一条语句
- 额外检查：拒绝包含分号的多语句
- DDL 操作即使意外执行也只影响 Draft DB，可通过 reconcile 恢复

### Risk 3：远程模式需要 cozybase daemon 新增端点

**场景：** `execute_sql` 需要 `POST /{mode}/apps/{appName}/db/_sql` 端点，当前 cozybase daemon 没有这个端点。

**缓解：**
- 本次 change 范围内新增此端点
- 端点实现简单（接收 SQL 字符串，执行，返回结果）
- SQL 安全检查逻辑在端点中实现，本地模式和远程模式共用

### Risk 4：大文件导致性能问题

**场景：** Agent 在工作目录中放入大文件，导致同步时传输大量数据。

**缓解：**
- 文件扫描时增加大小检查，跳过超过 1MB 的文件
- `update_app` 返回的 changes 信息让 Agent 知道哪些文件被同步了

### Risk 5：远程模式网络问题

**场景：** Homelab 场景下网络不稳定。

**缓解：**
- Agent 的文件读写操作不依赖网络（本地操作）
- 只有同步和工作流操作需要网络
- MCP 工具返回清晰的错误信息（连接超时、服务不可用等）

## Open Questions

1. **`cozybase mcp` 的启动方式：** 本地模式是嵌入一个完整的 cozybase 实例，还是连接到已运行的 daemon？嵌入式更简单（不需要先启动 daemon），但内存开销更大。

2. **远程模式的认证：** 调用远程 cozybase API 时是否需要 API key？当前 Management API 没有强制认证。如果 cozybase 暴露在网络上（Homelab），认证是必须的。

3. **call_api 的响应体大小限制：** `GET /db/todos` 可能返回大量数据，是否在 MCP 工具层做截断？建议设置合理的默认 limit（100 行）。
