## Context

当前系统采用声明式 Reconciler 模型：Workspace 扫描 `tables/*.yaml` 文件，与数据库当前状态 diff，自动生成 CREATE TABLE / ALTER TABLE SQL 并立即执行。每次 `POST /api/v1/reconcile` 均全局执行且直接作用于生产数据库，随后自动 git commit。

这种模型不支持隔离开发——AI Agent 的每次 schema 变更都是"生产部署"，不可预览、不可验证、不可回滚。

本次变更引入 Stable/Draft 双版本模型和 Migration-based 数据库管理，使 Agent 能在隔离环境中迭代开发，验证变更对真实数据的影响后再发布。

### 关键约束

- 运行时为 Bun（内置 `bun:sqlite`，非 better-sqlite3）
- SQLite 的 ALTER TABLE 能力有限（不支持 DROP COLUMN 等复杂操作，需通过 "copy table" 策略变通）
- Git 作为版本边界：committed = stable，unstaged = draft
- 单 Agent 场景优先，多 Agent 并发后续考虑

## Goals / Non-Goals

**Goals:**

- AI Agent 能在 Draft 环境中安全迭代开发，不影响 Stable 用户数据
- 提供 Verify 机制验证 migration 在真实数据上的可行性
- Publish 流程原子化：备份 → 执行 → commit，失败可恢复
- Migration-based 模型让 schema 变更有序、可追溯、不可变
- 每个 App 完全独立，reconcile/verify/publish 按 App 粒度操作

**Non-Goals:**

- 多 Agent 同时修改同一 App（后续 git worktree 方案）
- Migration down/rollback 自动执行（MVP 仅备份恢复）
- 自动化测试 / E2E 测试集成（Verify 后续扩展点）
- 跨 App 事务性发布（每个 App 独立 publish）
- Functions 运行时实现（仅预留 draft/stable 路径隔离）

## Decisions

### Decision 1: Reconciler 拆分为三个独立类

**选择**: 将现有的 `Reconciler` 类拆分为 `DraftReconciler`、`Verifier`、`Publisher` 三个类。

**替代方案**: 保留单一 `Reconciler` 类，通过参数区分模式。

**理由**: 三个流程的职责完全不同——DraftReconciler 是销毁重建，Verifier 是只读验证，Publisher 是增量执行 + git commit。单一类会导致方法内部充斥 if/else 分支。拆分后每个类职责单一，易于测试和扩展。

```
packages/server/src/core/
├── draft-reconciler.ts    # Draft Reconcile：销毁重建
├── verifier.ts            # Verify：在 temp 副本上验证
├── publisher.ts           # Publish：增量执行 + 备份 + git commit
├── migration-runner.ts    # 共享：migration 文件扫描、排序、SQL 执行
├── seed-loader.ts         # 共享：seed 文件加载（SQL / JSON）
├── workspace.ts           # 修改：新增 draftDir、状态推导
└── app-context.ts         # 修改：Stable/Draft 双模式
```

### Decision 2: 提取 MigrationRunner 作为共享基础

**选择**: 提取 `MigrationRunner` 类，封装 migration 文件的扫描、排序、校验、执行逻辑。三个主流程类（DraftReconciler、Verifier、Publisher）都依赖它。

**理由**: 三个流程的区别在于"怎么准备数据库"和"执行后做什么"，但"扫描 migration 文件 → 排序 → 执行 SQL"的核心逻辑是完全相同的。

```typescript
// migration-runner.ts 核心接口
interface MigrationFile {
  version: number;
  name: string;        // e.g. "001_create_todos"
  filename: string;    // e.g. "001_create_todos.sql"
  sql: string;         // 文件内容
}

class MigrationRunner {
  /** 扫描并排序 migration 文件 */
  scanMigrations(migrationsDir: string): MigrationFile[]

  /** 在指定数据库上执行一组 migration */
  executeMigrations(db: Database, migrations: MigrationFile[]): MigrationResult

  /** 创建 _migrations 表（仅 stable 需要） */
  initMigrationsTable(db: Database): void

  /** 读取已执行的 migration 版本列表 */
  getExecutedVersions(db: Database): number[]
}
```

### Decision 3: AppContext 不拆分为 StableAppContext/DraftAppContext

**选择**: 保持单一 `AppContext` 类，内部同时持有 stable 和 draft 两个数据库连接（均为懒初始化）。通过属性 `stableDb` 和 `draftDb` 分别访问。

**替代方案**: 创建 `StableAppContext` 和 `DraftAppContext` 两个独立类。

**理由**: 两种 context 的路径、lifecycle、owner（Workspace）关系几乎相同，唯一区别是 DB 指向不同文件。拆分为两个类会导致 Workspace 需要维护两套缓存 Map，中间件逻辑也变得复杂。

单一 AppContext 可以同时服务 Stable 和 Draft 请求，中间件只需根据路由前缀决定使用 `stableDb` 还是 `draftDb`。

```typescript
class AppContext {
  readonly name: string;
  readonly specDir: string;
  readonly stableDataDir: string;     // data/apps/{name}
  readonly stableDbPath: string;      // data/apps/{name}/db.sqlite
  readonly draftDataDir: string;      // draft/apps/{name}
  readonly draftDbPath: string;       // draft/apps/{name}/db.sqlite

  private _stableDb: Database | null = null;
  private _draftDb: Database | null = null;

  get stableDb(): Database { /* 懒初始化，指向 stable path */ }
  get draftDb(): Database { /* 懒初始化，指向 draft path */ }

  /** 销毁 draft 数据库（DraftReconciler 调用） */
  resetDraft(): void { /* 关闭连接，删除文件 */ }

  /** 关闭所有连接 */
  close(): void { /* 关闭 stable + draft */ }
}
```

### Decision 4: 路由结构——Hono 嵌套 router

**选择**: 使用两个顶级路由组 `/stable/apps/:appName` 和 `/draft/apps/:appName`，各自挂载独立的 app-resolver 中间件，复用同一套 DB routes。

**替代方案 A**: 通过 Header `X-App-Version: draft` 区分。
**替代方案 B**: 保持旧路由，新增 `/draft/` 前缀。

**理由**: 路径区分最直观，对 AI Agent 友好（不需要记忆 Header），且 Hono 的 nested router 天然支持这种结构。

```typescript
// server.ts 路由挂载
const stableScoped = new Hono();
stableScoped.use('*', appResolver(workspace, 'stable'));
stableScoped.route('/db', createDbRoutes());
app.route('/stable/apps/:appName', stableScoped);

const draftScoped = new Hono();
draftScoped.use('*', appResolver(workspace, 'draft'));
draftScoped.route('/db', createDbRoutes());
app.route('/draft/apps/:appName', draftScoped);

// 管理路由
app.post('/draft/apps/:appName/reconcile', ...);
app.post('/draft/apps/:appName/verify', ...);
app.post('/draft/apps/:appName/publish', ...);
```

### Decision 5: App 状态推导实现——通过 git status + fs 检查

**选择**: 在 Workspace 上提供 `getAppState(name): AppState` 方法，通过 `git status --porcelain` 和 `existsSync(stableDbPath)` 动态计算。

**替代方案**: 在 platform.sqlite 中维护一个 app_state 表。

**理由**: 状态由 git 和文件系统决定，在数据库中维护状态会引入一致性问题（database 和 filesystem 不同步）。动态推导保证状态始终准确。

性能影响：每次请求都 spawn git 进程会有开销。优化策略：
- App 状态可以在 Workspace 加载时缓存
- Draft Reconcile / Publish 完成后主动刷新缓存
- 对于 HTTP 请求，使用缓存值而非每次调用 git

```typescript
type AppState = 'draft_only' | 'stable' | 'stable_draft' | 'deleted';

class Workspace {
  private _appStates = new Map<string, AppState>();

  /** 推导 App 状态（带缓存） */
  getAppState(name: string): AppState

  /** 刷新指定 App 的状态缓存 */
  refreshAppState(name: string): void

  /** 刷新所有 App 的状态缓存 */
  refreshAllAppStates(): void
}
```

### Decision 6: DraftReconciler 每次销毁重建，不追踪 migration

**选择**: Draft Reconcile 时直接删除 draft.sqlite，从空库开始重新执行全部 migration + seed。不在 draft 库中创建 `_migrations` 表。

**替代方案**: Draft 也做增量执行（追踪已执行的 migration）。

**理由**: Draft 数据库只有 seed 数据，没有用户真实数据，销毁成本极低。销毁重建策略避免了以下复杂场景：
- Agent 修改了已执行的 migration → 增量模式下需要 rollback + replay
- Agent 删除了某个 migration → 增量模式下状态不一致
- seed 数据变更 → 增量模式下需要清空再重新加载

### Decision 7: Verify 使用文件复制而非 SQLite backup API

**选择**: Verify 时通过 `Bun.file().arrayBuffer()` + `Bun.write()` 复制 stable.sqlite 到临时文件。

**替代方案**: 使用 SQLite 的 `backup` API。

**理由**: Bun 的 `bun:sqlite` 模块目前没有暴露 SQLite backup API。文件复制在 SQLite WAL 模式下需要先执行 checkpoint 确保数据完整：

```typescript
// Verify 前确保 WAL 写入主文件
stableDb.exec('PRAGMA wal_checkpoint(TRUNCATE)');
stableDb.close();

// 文件复制
const data = await Bun.file(stableDbPath).arrayBuffer();
await Bun.write(tempDbPath, data);
```

临时文件路径：`draft/apps/{appName}/verify_temp.sqlite`（复用 draft 目录，verify 完成后删除）。

### Decision 8: 移除 resource_state 表，保留 platform DB 其他表

**选择**: 从 `initPlatformSchema()` 中移除 `resource_state` 表的创建，保留 `apps`、`platform_users`、`api_keys` 表。

**理由**: `resource_state` 用于声明式 diff 中追踪每个资源的 spec_hash，migration-based 模型不再需要（migration 追踪在每个 app 的 SQLite 中）。但 platform DB 的 app 注册、用户管理、API key 管理等功能仍然需要。

`apps` 表中的 `status` 字段保留——当 App 被标记为 `deleted` 时，同步更新 `apps` 表的状态，方便管理 UI 查询。

### Decision 9: Migration 文件校验规则

**选择**: 文件名 MUST 匹配 `/^\d{3}_[a-z0-9_]+\.sql$/`。

校验时机和内容：
- **扫描时**: 忽略不匹配的文件名（warn），不阻塞流程
- **版本号连续性**: warn 但不阻塞（允许跳号）
- **SQL 语法**: 不做预校验（由 SQLite 执行时报错）
- **已 committed migration 不可变**: 仅在 Verify 阶段通过 `git show HEAD:{path}` 对比检测

### Decision 10: 启动时行为变更——不再自动 reconcile

**选择**: 服务器启动时不再自动执行全局 reconcile。仅加载 workspace 配置和扫描 app 列表。

**替代方案**: 启动时对所有 Stable App 执行 reconcile。

**理由**: Migration-based 模型下，Stable 数据库的状态由已执行的 migration 决定，不需要每次启动都 diff + sync。启动时只需要：
1. 加载 workspace.yaml
2. 扫描 apps/ 目录
3. 刷新所有 App 状态缓存
4. 初始化 platform DB

Agent 手动触发 Draft Reconcile / Publish 来推进变更。

## Risks / Trade-offs

### Risk 1: git status 调用性能

**风险**: `getAppState()` 依赖 `git status --porcelain`，spawn 子进程有约 10-50ms 开销。若每次 HTTP 请求都调用，高并发下成为瓶颈。

**缓解**: 使用缓存策略——Workspace 启动时计算所有 App 状态并缓存，仅在 DraftReconcile / Publish / 手动刷新时更新。HTTP 请求使用缓存值。

### Risk 2: SQLite WAL 模式下文件复制的原子性

**风险**: Verify 和 Publish 备份 stable.sqlite 时，若有并发写入（Stable HTTP 请求正在 INSERT），复制的文件可能不一致。

**缓解**: Verify/Publish 前执行 `PRAGMA wal_checkpoint(TRUNCATE)` 将 WAL 内容写入主文件，然后关闭连接再复制。Publish 期间的 Stable 写入请求可能会短暂失败——MVP 阶段可接受，后续可加锁机制。

### Risk 3: Agent 生成的 SQL 质量

**风险**: AI Agent 生成的 migration SQL 可能有语法错误、逻辑错误或 SQLite 不兼容的语法。

**缓解**: Draft Reconcile 是安全的（失败后销毁重建），Agent 可以反复迭代。Verify 在临时副本上执行，不影响生产。Publish 前有备份。三道防线保障数据安全。

### Risk 4: 大型 stable.sqlite 的备份耗时

**风险**: 如果 App 的 stable.sqlite 文件很大（百 MB 级别），文件复制（备份和 Verify 副本）会耗时较长。

**缓解**: MVP 阶段面向的用户场景是轻量级应用，数据库通常在 10MB 以内。后续可考虑使用 SQLite VACUUM INTO 或增量备份。

### Risk 5: 现有 workspace 的迁移

**风险**: 已有的 workspace 使用 `tables/*.yaml` 格式，升级后 Reconciler 不再识别。

**缓解**: 提供一次性迁移脚本或 CLI 命令（不在本次 scope 内），将 `tables/*.yaml` 转换为对应的 `migrations/001_initial.sql`。文档中标明 breaking change 和迁移步骤。

## Migration Plan

### 代码迁移步骤

1. **新增文件**: `migration-runner.ts`、`seed-loader.ts`、`draft-reconciler.ts`、`verifier.ts`、`publisher.ts`
2. **修改 `workspace.ts`**: 新增 `draftDir` 属性、`getAppState()` 方法、状态缓存机制、修改 `scanApps()` 以扫描 migration 文件替代 table 文件、修改 `init()` 以创建 `draft/` 目录和更新 `.gitignore`
3. **修改 `app-context.ts`**: 新增 `draftDataDir`/`draftDbPath`/`draftDb`/`resetDraft()` 等
4. **修改 `server.ts`**: 拆分路由为 `/stable/` 和 `/draft/` 两组，移除启动时自动 reconcile，新增管理路由
5. **修改 `middleware/app-resolver.ts`**: 接受 mode 参数，按模式注入 Stable 或 Draft AppContext
6. **修改 `modules/db/routes.ts`**: 从 `c.get('appContext')` 获取 DB（已有逻辑兼容，只需确保 AppContext 注入的是正确模式的 DB）
7. **重写 `reconciler.ts`**: 移除声明式 diff 逻辑，或直接删除并用新的三个类替代
8. **清理**: 移除 `resource_state` 表创建、ColumnSchema/TableSpecSchema/IndexSchema 等不再使用的 Zod schema、`hashContent()` 工具函数

### 回滚策略

git revert 或 checkout 到变更前的 commit。已有 workspace 数据不受影响（data/ 和 draft/ 均为 git ignored）。

## Open Questions

1. **Seed 文件的 JSON schema 是否需要 Zod 校验？** 当前倾向 yes，在载入时校验 `{table, rows}` 结构，提供清晰的错误信息。
2. **Publish 期间是否需要暂停 Stable 的写入请求？** MVP 阶段仅做 WAL checkpoint + 文件复制，不加锁。后续可考虑 maintenance mode。
3. **`apps` 表中的 status 字段是否应该和文件系统状态保持同步？** 当前倾向 yes，在 Publish 和 soft delete 时同步更新 platform DB 中的 app 状态。
