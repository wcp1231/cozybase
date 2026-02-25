## Context

当前 cozybase 的 APP 定义以文件系统为 Source of Truth，通过 Git 追踪变更历史。核心模块（Workspace、DraftReconciler、Publisher、Verifier）全部基于文件系统操作（`readFileSync`、`readdirSync`、`existsSync`）和 Git 命令（`git status`、`git show`、`git add`、`git commit`）构建。

这次改造将 Source of Truth 迁移到 Platform DB，所有核心模块需要从"读文件"切换到"读数据库"。同时新建 Management API 和 MCP 工具接口，使 AI Agent 和 Admin UI 能通过统一的 API 操作 APP。

### 现有模块依赖关系

```
server.ts
  ├── Workspace          ← 文件扫描 + Git + Platform DB + AppContext 注册
  ├── DraftReconciler    ← 读文件系统 migration/seed/function → 构建 draft DB
  ├── Verifier           ← Git diff 校验 + 临时 DB 验证
  ├── Publisher           ← 读文件系统 migration → 执行到 stable DB + Git commit
  ├── AppManager         ← 创建文件目录 + Platform DB 记录
  ├── DirectRuntime      ← Bun import() 从文件系统加载 function
  └── Routes
      ├── appRoutes      ← 调用 workspace.scanApps()
      ├── dbRoutes       ← 使用 AppContext.stableDb / draftDb
      ├── functionRoutes ← 使用 DirectRuntime
      └── draftMgmt      ← reconcile / verify / publish
```

### 约束

- Bun runtime：function 执行依赖 `import()` 加载 `.ts` 文件，必须有磁盘文件
- SQLite：Platform DB 和 Per-App DB 均使用 `bun:sqlite`，WAL 模式
- 单进程模型：当前无多进程并发问题，乐观锁主要防范的是 Agent 并发请求

## Goals / Non-Goals

**Goals:**

- APP 定义（migrations、functions、seeds、app.yaml）的 Source of Truth 从文件系统迁移到 Platform DB
- 移除所有 Git 依赖（`git init`、`git add`、`git commit`、`git status`、`git show`）
- 提供 Management API，使 Agent 和 Admin UI 能通过 HTTP 管理 APP 文件
- 定义 MCP 工具集接口（实现在后续 change）
- 保持现有的 `/stable/` 和 `/draft/` 路由以及 reconcile/verify/publish 工作流不变
- 支持从旧版（filesystem-first）workspace 自动迁移

**Non-Goals:**

- 实现 MCP Server（只定义工具接口）
- 实现 Admin UI
- 实现 `app_versions` 表和历史回滚功能
- 实现导入/导出功能
- 改变 Per-App SQLite 数据库的架构（`data/apps/{name}/db.sqlite` 和 `draft/apps/{name}/db.sqlite` 不变）

## Decisions

### Decision 1: Platform DB Schema 迁移方式

**选择**：在 `initPlatformSchema()` 中使用 `CREATE TABLE IF NOT EXISTS` + 条件 `ALTER TABLE`

**理由**：Platform DB 没有自己的 migration 系统。当前 `initPlatformSchema()` 已经使用 `CREATE TABLE IF NOT EXISTS`（幂等）。新增表和字段保持相同模式。

**实现**：

```typescript
// workspace.ts — initPlatformSchema()

// 新增 app_files 表
db.exec(`
  CREATE TABLE IF NOT EXISTS app_files (
    app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
    path TEXT NOT NULL,
    content TEXT NOT NULL,
    immutable INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (app_name, path)
  )
`);

// 扩展 apps 表（条件 ALTER）
const columns = db.query("PRAGMA table_info(apps)").all() as { name: string }[];
const columnNames = new Set(columns.map(c => c.name));

if (!columnNames.has('current_version')) {
  db.exec("ALTER TABLE apps ADD COLUMN current_version INTEGER DEFAULT 0");
}
if (!columnNames.has('published_version')) {
  db.exec("ALTER TABLE apps ADD COLUMN published_version INTEGER DEFAULT 0");
}
```

**替代方案**：为 Platform DB 引入自己的 migration 系统。过于复杂，不值得。

### Decision 2: MigrationRunner 和 SeedLoader 接口重构

**选择**：让 MigrationRunner 和 SeedLoader 接受"内容"而不是"文件路径"

**理由**：当前 `MigrationRunner.scanMigrations(dir)` 从目录扫描文件并读取内容。重构后调用方从 DB 查询内容，传入已解析的数据。这样 MigrationRunner 和 SeedLoader 变成纯数据处理器，不依赖文件系统。

**MigrationRunner 变化**：

```typescript
// 当前接口
interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  path: string;      // ← 文件系统路径
  sql: string;
}

// 重构后：path 不再必需（从 DB 来的没有文件路径）
interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

// 当前方法
scanMigrations(migrationsDir: string): MigrationFile[]

// 新增方法：从 DB 记录构建 MigrationFile 列表
static fromDbRecords(records: { path: string; content: string }[]): MigrationFile[]
```

`fromDbRecords` 从 `app_files` 查询结果（`path` 如 `migrations/001_init.sql`，`content` 为 SQL）解析出 `version`、`name`、`filename`、`sql`。复用现有的 `MIGRATION_PATTERN` 正则。

`scanMigrations(dir)` 保留但标记为 deprecated，仅用于 filesystem 迁移场景。

**SeedLoader 变化**：

```typescript
// 新增方法：从 DB 记录加载 seed
loadSeedsFromRecords(db: Database, records: { path: string; content: string }[]): SeedResult
```

根据 `path` 后缀（`.sql` 或 `.json`）决定处理方式，内容直接来自 `content` 字段。

**替代方案**：创建一个抽象层统一文件系统和 DB 读取。增加了不必要的抽象。

### Decision 3: Function 文件导出策略

**选择**：在 Reconcile/Publish 时从 DB 导出 function 文件到磁盘，Bun `import()` 从磁盘加载

**理由**：Bun 的 `import()` 需要文件系统路径。无法直接从数据库字符串加载 TypeScript 模块。

**数据流**：

```
Reconcile 时:
  app_files (DB) → WHERE path LIKE 'functions/%'
                 → 写入 draft/apps/{name}/functions/*.ts
                 → Bun import() 从 draft 目录加载
                 → 验证 exports

Publish 时:
  app_files (DB) → WHERE path LIKE 'functions/%'
                 → 写入 data/apps/{name}/functions/*.ts
                 → DirectRuntime.reload() 清除模块缓存
                 → 后续请求重新 import() 从 data 目录加载
```

**实现**：抽取公共的 `exportFunctionsToDir(appName, targetDir)` 方法，DraftReconciler 和 Publisher 共用。

```typescript
// 公共方法（可以放在 Workspace 或单独的 helper 中）
function exportFunctionsFromDb(
  platformDb: Database,
  appName: string,
  targetDir: string
): string[] {
  // 清理目标目录
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true });
  }

  // 查询 function 文件
  const records = platformDb.query(
    "SELECT path, content FROM app_files WHERE app_name = ? AND path LIKE 'functions/%'"
  ).all(appName) as { path: string; content: string }[];

  if (records.length === 0) return [];

  mkdirSync(targetDir, { recursive: true });
  const exported: string[] = [];

  for (const record of records) {
    const filename = record.path.replace('functions/', '');
    writeFileSync(join(targetDir, filename), record.content, 'utf-8');
    exported.push(filename);
  }

  return exported;
}
```

**替代方案**：使用 Bun 的 `Bun.write` + `import()` with data URIs。Bun 目前不支持 TypeScript data URIs 的 import。

### Decision 4: App 状态推导重构

**选择**：基于 DB 字段（`status`、`published_version`、`current_version`）推导，替代 Git status

**当前实现**（依赖文件系统 + Git）：

```
1. existsSync(app.yaml) → 存在？
2. parsed.status === 'deleted' → Deleted
3. existsSync(stableDbPath) → Stable DB 存在？
4. git status --porcelain apps/{name}/ → 有未提交变更？
5. 组合判断
```

**新实现**（纯 DB 查询）：

```
1. SELECT status, published_version, current_version FROM apps WHERE name = ?
2. status = 'deleted'          → Deleted
3. published_version = 0       → Draft only
4. current_version = published_version  → Stable
5. current_version > published_version  → Stable + Draft
```

不再需要 `hasUnstagedChanges()` 方法和任何 Git 调用。

`refreshAppState()` 变为 DB 查询，`refreshAllAppStates()` 变为一次 `SELECT * FROM apps` 批量查询。

### Decision 5: AppDefinition 和 AppContext 改造

**选择**：简化 AppDefinition，移除文件路径依赖

**当前 AppDefinition**：

```typescript
interface AppDefinition {
  name: string;
  dir: string;           // ← 文件系统目录
  spec: AppSpec;
  migrations: string[];  // ← 文件路径列表
  seeds: string[];       // ← 文件路径列表
  functions: string[];   // ← 函数名列表
}
```

**重构后**：

```typescript
interface AppDefinition {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
}
```

不再持有文件列表。需要文件内容时直接查 `app_files` 表。AppDefinition 退化为 `apps` 表的一行记录。

**AppContext 改造**：

```typescript
class AppContext {
  // 移除: specDir（不再有文件系统 spec 目录）
  // 保留: stableDataDir, stableDbPath, draftDataDir, draftDbPath
  // 修改: constructor 不再接受 appsDir 参数

  constructor(
    name: string,
    dataRootDir: string,
    draftRootDir: string,
  ) {
    this.name = name;
    this.stableDataDir = join(dataRootDir, 'apps', name);
    this.stableDbPath = join(this.stableDataDir, 'db.sqlite');
    this.draftDataDir = join(draftRootDir, 'apps', name);
    this.draftDbPath = join(this.draftDataDir, 'db.sqlite');
  }
}
```

### Decision 6: Management API 设计

**选择**：扩展现有 `/api/v1/apps` 路由，RESTful 设计

**`POST /api/v1/apps` — 创建 APP**

Request:
```json
{ "name": "blog", "description": "博客系统" }
```

Response (201):
```json
{
  "data": {
    "name": "blog",
    "description": "博客系统",
    "current_version": 1,
    "published_version": 0,
    "state": "draft_only",
    "files": [
      { "path": "app.yaml", "content": "description: 博客系统\n" },
      { "path": "migrations/001_init.sql", "content": "-- Write your first migration here\n" },
      { "path": "functions/hello.ts", "content": "export default async function(ctx) {\n  return { message: 'Hello from blog!' };\n}\n" }
    ],
    "api_key": "cb_xxxx..."
  }
}
```

创建时自动生成模板文件插入 `app_files`，`current_version` 设为 1。

**`GET /api/v1/apps/:name` — 获取 APP（含所有文件）**

Response:
```json
{
  "data": {
    "name": "blog",
    "description": "博客系统",
    "current_version": 3,
    "published_version": 2,
    "state": "stable_draft",
    "files": [
      { "path": "app.yaml", "content": "...", "immutable": false },
      { "path": "migrations/001_init.sql", "content": "...", "immutable": true },
      { "path": "migrations/002_add_comments.sql", "content": "...", "immutable": false },
      { "path": "functions/posts.ts", "content": "...", "immutable": false }
    ]
  }
}
```

**`PUT /api/v1/apps/:name` — 整体更新 APP**

Request:
```json
{
  "base_version": 3,
  "files": [
    { "path": "app.yaml", "content": "description: 博客系统\n" },
    { "path": "migrations/001_init.sql", "content": "CREATE TABLE posts..." },
    { "path": "migrations/002_add_comments.sql", "content": "CREATE TABLE comments..." },
    { "path": "functions/posts.ts", "content": "export async function GET(ctx)..." },
    { "path": "functions/comments.ts", "content": "export async function GET(ctx)..." }
  ]
}
```

处理逻辑：
1. 校验 `base_version`：`SELECT current_version FROM apps WHERE name = ?`，不匹配返回 409
2. 校验 immutable：请求中的文件如果对应 `immutable = 1` 的记录且内容变更，返回 400
3. 计算 diff：对比请求的 files 和 DB 中当前 files
   - 新增：INSERT
   - 修改：UPDATE content
   - 删除：请求中没有但 DB 中有的文件 → DELETE（immutable 文件不可删）
4. 递增 `current_version`，更新 `updated_at`
5. 返回更新后的完整 APP

Response (200): 同 GET 格式

Error (409):
```json
{ "error": { "code": "VERSION_CONFLICT", "message": "Version conflict: expected 3, current is 4. Please fetch and retry." } }
```

**`PUT /api/v1/apps/:name/files/*` — 单文件更新**

Request:
```json
{ "content": "export async function GET(ctx) { ... }" }
```

不需要 `base_version`（单文件操作的冲突概率低，且 `current_version` 会递增）。校验 `immutable` 后直接 UPSERT。

**`DELETE /api/v1/apps/:name` — 删除 APP**

删除 `app_files` 记录、`apps` 记录、`api_keys` 记录，以及 `data/apps/{name}/` 和 `draft/apps/{name}/` 目录。

### Decision 7: Workspace 初始化改造

**选择**：首次启动时从模板目录读取文件内容写入 DB，替代 `cpSync`

**当前流程**：

```
init() → mkdirSync(apps/) → cpSync(templates/welcome/, apps/welcome/)
       → gitExec(['init']) → gitExec(['add', '.']) → gitExec(['commit'])
```

**新流程**：

```
init() → mkdirSync(data/) → mkdirSync(draft/)
       → writeFileSync(workspace.yaml)
       → getPlatformDb()  // 触发 schema 初始化
       → loadTemplateApps()  // 从 templates/ 读取，写入 DB
```

`loadTemplateApps()` 实现：

```typescript
private loadTemplateApps(): void {
  if (!existsSync(TEMPLATES_DIR)) return;

  const templates = readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory());

  for (const template of templates) {
    const templateDir = join(TEMPLATES_DIR, template.name);
    this.importAppFromDir(template.name, templateDir);
  }
}

private importAppFromDir(appName: string, dir: string): void {
  const db = this.getPlatformDb();

  // 读取 app.yaml 获取 description
  const appYaml = readFileSync(join(dir, 'app.yaml'), 'utf-8');
  const spec = parseYAML(appYaml) ?? {};
  const description = spec.description ?? '';

  // 创建 apps 记录
  db.query('INSERT OR IGNORE INTO apps (name, description) VALUES (?, ?)').run(appName, description);

  // 扫描所有文件，写入 app_files
  const files = this.collectFiles(dir, '');
  for (const file of files) {
    db.query(
      'INSERT OR IGNORE INTO app_files (app_name, path, content) VALUES (?, ?, ?)'
    ).run(appName, file.path, file.content);
  }

  // 设置 current_version = 1
  db.query('UPDATE apps SET current_version = 1 WHERE name = ?').run(appName);
}
```

### Decision 8: Verifier 不可变校验

**选择**：基于 `app_files.immutable` 字段，替代 Git diff

**理由**：`immutable = 1` 的文件在 API 层就被拒绝修改，所以 Verifier 的校验变成了防御性检查。但仍然保留，因为：
- 防止直接操作 DB 绕过 API
- 给出更明确的错误信息

**新实现**：

```typescript
private checkMigrationImmutability(appName: string): string | null {
  const db = this.workspace.getPlatformDb();

  // 查询所有 immutable 的 migration 文件
  // 如果存在 immutable = 1 的文件，说明已经 publish 过
  // 此时不需要对比内容——因为 immutable 文件在 API 层无法修改
  // 这里只是确认 immutable 标记的一致性

  // 真正的校验场景：检查 _migrations 表中已执行的 version
  // 是否对应的 app_files 都标记了 immutable
  const stableDb = this.workspace.getOrCreateApp(appName)?.stableDb;
  if (!stableDb) return null;

  const executedVersions = this.migrationRunner.getExecutedVersions(stableDb);
  if (executedVersions.length === 0) return null;

  // 检查所有已执行的 migration 在 app_files 中是否存在且 immutable
  for (const version of executedVersions) {
    const versionStr = String(version).padStart(3, '0');
    const record = db.query(
      "SELECT immutable FROM app_files WHERE app_name = ? AND path LIKE ? LIMIT 1"
    ).get(appName, `migrations/${versionStr}_%`) as { immutable: number } | null;

    if (!record) {
      return `Published migration version ${versionStr} is missing from app_files`;
    }
    if (!record.immutable) {
      return `Published migration version ${versionStr} is not marked as immutable — data integrity issue`;
    }
  }

  return null;
}
```

### Decision 9: 旧 Workspace 迁移策略

**选择**：启动时自动检测并迁移，一次性操作

**检测条件**：`apps/` 目录存在 且 `app_files` 表为空

**迁移步骤**：

```
1. 扫描 apps/ 下所有 APP 目录（复用现有 loadAppDefinition 逻辑）
2. 对每个 APP:
   a. 读取 app.yaml → 解析 description
   b. INSERT INTO apps（如果不存在）
   c. 遍历所有文件（migrations/*.sql, seeds/*, functions/*.ts, app.yaml）
      → INSERT INTO app_files
   d. 检查 stable DB 是否存在：
      - 存在 → 读取 _migrations 表，标记对应 migration 为 immutable = 1
      - 设置 published_version = current_version
   e. 不存在 → published_version = 0
3. 迁移完成后打印日志
4. apps/ 目录保留不删除（用户可手动清理）
```

此逻辑放在 `Workspace.load()` 中，每次启动检查一次。`app_files` 表非空时跳过。

## Risks / Trade-offs

### Risk 1: Platform DB 单点故障

**风险**：所有 APP 定义集中在 `platform.sqlite` 一个文件中。文件损坏 = 全部丢失。

**缓解**：
- SQLite WAL 模式本身提供了崩溃恢复能力
- 后续可添加定期备份（导出为文件目录或 SQL dump）
- MVP 阶段风险可接受：本地开发环境，数据量小

### Risk 2: 大文件内容存 DB 的性能

**风险**：function 文件可能较大，频繁的全量读取（`fetch_app` 返回所有文件内容）可能影响性能。

**缓解**：
- APP 的文件数量通常很少（几十个以内）
- 单个文件通常很小（几 KB）
- SQLite 处理 TEXT 字段高效
- 如果未来成为瓶颈，可以在 `list_apps` 中不返回文件内容，只在 `fetch_app` 中返回

### Risk 3: Function 文件导出的 I/O 开销

**风险**：每次 reconcile/publish 都要从 DB 读取 function 内容写到磁盘。

**缓解**：
- 文件数量和大小都很小
- 现有的 `copyFunctionsToDraft` 已经在做类似的文件复制操作
- 从"复制文件"变成"写入内容"，开销基本一致

### Risk 4: Scope 较大，改动涉及几乎所有核心模块

**风险**：一次性改动太多可能引入 bug。

**缓解**：分阶段实施——
1. 先扩展 Platform DB schema + 实现 `app_files` 读写
2. 改造 Workspace（移除 Git，添加 DB 初始化和模板加载）
3. 改造 MigrationRunner / SeedLoader 接口
4. 改造 DraftReconciler / Publisher / Verifier
5. 实现 Management API
6. 实现旧 workspace 迁移
7. 清理旧代码

### Risk 5: `update_app` 的整体替换可能误删文件

**风险**：Agent 发送 `update_app` 时遗漏了某个文件，该文件会被删除。

**缓解**：
- `immutable = 1` 的文件不会被删除（即使请求中没有，也保留不动）
- `update_app` 的响应中包含最终的文件列表，Agent 可以验证
- `update_app_file` 提供单文件更新，避免误操作

## Open Questions

1. **`update_app` 是否应该删除请求中不包含的文件？** 当前设计是"请求是完整状态，缺失即删除"。替代方案是"只更新/新增，不自动删除"，需要单独的 `DELETE` 操作。前者更符合 "Checkout-Edit-Push" 模型。
2. **模板文件内容是否硬编码还是继续从 `templates/` 目录读取？** 当前选择是继续从 `templates/` 目录读取（init 时），好处是模板可以独立维护。
