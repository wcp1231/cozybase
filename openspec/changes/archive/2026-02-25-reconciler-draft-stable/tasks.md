## 1. 基础设施：MigrationRunner 和 SeedLoader

- [x] 1.1 创建 `packages/server/src/core/migration-runner.ts`，实现 `MigrationFile` 接口和 `MigrationRunner` 类：`scanMigrations(migrationsDir)` 扫描并按数字前缀排序 migration 文件、`executeMigrations(db, migrations)` 按序执行 SQL、`initMigrationsTable(db)` 创建 `_migrations` 表、`getExecutedVersions(db)` 读取已执行版本列表
- [x] 1.2 实现 migration 文件名校验：匹配 `/^\d{3}_[a-z0-9_]+\.sql$/`，不匹配的文件 warn 并跳过；版本号不连续 warn 但不阻塞
- [x] 1.3 创建 `packages/server/src/core/seed-loader.ts`，实现 `SeedLoader` 类：支持 `.sql` 文件直接执行、`.json` 文件解析 `{table, rows}` 结构后转换为 INSERT 语句；按文件名字母顺序加载；seeds 目录不存在时静默跳过

## 2. Workspace 改造

- [x] 2.1 修改 `Workspace` 类：新增 `draftDir` 只读属性（`join(root, 'draft')`），构造函数中初始化
- [x] 2.2 修改 `init()` 方法：创建 `draft/` 子目录、`.gitignore` 新增 `draft/` 条目、示例 app 改为 migration 格式（`apps/hello/migrations/001_init.sql`）
- [x] 2.3 修改 `scanApps()` 方法：扫描 `migrations/*.sql` 替代 `tables/*.yaml`；检测 `seeds/` 目录；解析 `app.yaml` 中的 `status` 字段
- [x] 2.4 更新 `AppDefinition` 接口：移除 `tables: Map`，新增 `migrations: string[]`（migration 文件路径列表）和 `seeds: string[]`（seed 文件路径列表）；新增 `status?: 'deleted'` 字段
- [x] 2.5 实现 `getAppState(name): AppState` 方法：通过 `git status --porcelain apps/{name}/` 和 `existsSync(stableDbPath)` 推导状态（`draft_only` / `stable` / `stable_draft` / `deleted`）
- [x] 2.6 实现 App 状态缓存：`_appStates: Map<string, AppState>`，`refreshAppState(name)` 和 `refreshAllAppStates()` 方法；`load()` 时初始化缓存
- [x] 2.7 移除旧代码：`ColumnSchema`、`IndexSchema`、`TableSpecSchema` 等 Zod schema 定义、`hashContent()` 函数、`resource_state` 表创建

## 3. AppContext 改造

- [x] 3.1 修改 `AppContext` 构造函数：新增 `draftDataDir` 和 `draftDbPath` 参数，接受 `draftRootDir` 参数
- [x] 3.2 新增 `stableDb` 和 `draftDb` 双数据库属性：各自懒初始化，分别指向 `data/apps/{name}/db.sqlite` 和 `draft/apps/{name}/db.sqlite`
- [x] 3.3 新增 `resetDraft()` 方法：关闭 draft DB 连接、删除 `draft/apps/{name}/db.sqlite` 文件、将 `_draftDb` 置空（下次访问重新懒初始化）
- [x] 3.4 修改 `close()` 方法：同时关闭 stable 和 draft 两个连接
- [x] 3.5 移除 `reload(definition)` 方法和原有的单一 `db` getter，改为 `stableDb` / `draftDb` 双 getter
- [x] 3.6 修改 `Workspace.getOrCreateApp(name)` 方法：传入 `draftDir` 参数给 AppContext 构造函数

## 4. 核心流程：DraftReconciler

- [x] 4.1 创建 `packages/server/src/core/draft-reconciler.ts`，实现 `DraftReconciler` 类：依赖 `Workspace`、`MigrationRunner`、`SeedLoader`
- [x] 4.2 实现 `reconcile(appName): DraftReconcileResult` 方法：校验 App 状态为 `draft_only` 或 `stable_draft`、调用 `appContext.resetDraft()` 销毁旧库、执行全部 migration、加载 seeds、返回结果
- [x] 4.3 定义 `DraftReconcileResult` 接口：包含 `success: boolean`、`migrations: string[]`（已执行列表）、`seeds: string[]`（已加载列表）、`error?: string`

## 5. 核心流程：Verifier

- [x] 5.1 创建 `packages/server/src/core/verifier.ts`，实现 `Verifier` 类：依赖 `Workspace`、`MigrationRunner`
- [x] 5.2 实现已 committed migration 不可变检测：通过 `git show HEAD:{relativePath}` 获取 committed 版本，与工作区版本对比，发现修改立即报错
- [x] 5.3 实现 `verify(appName): VerifyResult` 方法：校验 App 状态为 `stable_draft`、检测 migration 不可变、WAL checkpoint + 复制 stable.sqlite → temp 文件、在 temp 上执行新增 migration、返回结果、清理 temp 文件
- [x] 5.4 定义 `VerifyResult` 接口：包含 `success: boolean`、`migrationsToApply: string[]`、`error?: string`、`detail?: string`（变更摘要）

## 6. 核心流程：Publisher

- [x] 6.1 创建 `packages/server/src/core/publisher.ts`，实现 `Publisher` 类：依赖 `Workspace`、`MigrationRunner`
- [x] 6.2 实现 `publish(appName): PublishResult` 方法：校验 App 状态为 `draft_only` 或 `stable_draft`
- [x] 6.3 实现 Stable 数据库备份：复制 `db.sqlite` → `db.sqlite.bak`（新 App 跳过备份）
- [x] 6.4 实现增量 migration 执行：读取 `_migrations` 表获取已执行版本、执行新增 migration、更新 `_migrations` 记录；新 App 则先 `initMigrationsTable()` 再执行全部 migration
- [x] 6.5 实现失败回滚：migration 执行失败时用 `db.sqlite.bak` 恢复 stable.sqlite
- [x] 6.6 实现 git commit：`git add apps/{appName}/` && `git commit -m "publish: {appName} - {摘要}"`
- [x] 6.7 实现清理：删除 draft.sqlite、刷新 App 状态缓存
- [x] 6.8 定义 `PublishResult` 接口：包含 `success: boolean`、`migrationsApplied: string[]`、`error?: string`

## 7. HTTP 路由改造

- [x] 7.1 修改 `server.ts`：拆分路由为 `/stable/apps/:appName` 和 `/draft/apps/:appName` 两组，各自挂载 `appResolver` 中间件（传入 mode 参数）
- [x] 7.2 修改 `middleware/app-resolver.ts`：接受 `mode: 'stable' | 'draft'` 参数；根据 mode 和 App 状态校验兼容性（如 Stable 模式访问 Draft only App 返回 404）；注入正确模式的 AppContext（设置 `c.set('appMode', mode)` 供 handler 选择 DB）
- [x] 7.3 修改 `modules/db/routes.ts`：根据 `c.get('appMode')` 使用 `appContext.stableDb` 或 `appContext.draftDb`
- [x] 7.4 新增管理路由：`POST /draft/apps/:appName/reconcile`（调用 DraftReconciler）、`POST /draft/apps/:appName/verify`（调用 Verifier）、`POST /draft/apps/:appName/publish`（调用 Publisher）
- [x] 7.5 修改 `modules/apps/routes.ts`：app 状态信息接口返回推导后的状态（draft_only / stable / stable_draft / deleted）
- [x] 7.6 移除旧的 `POST /api/v1/reconcile` 全局 reconcile 端点
- [x] 7.7 修改 `server.ts` 启动逻辑：移除启动时自动 reconcile，改为加载 workspace + 扫描 apps + 刷新状态缓存

## 8. 清理与兼容

- [x] 8.1 删除旧的 `packages/server/src/core/reconciler.ts` 文件
- [x] 8.2 从 `workspace.ts` 中移除 `ColumnSchema`、`IndexSchema`、`TableSpecSchema` 和相关类型定义，移除 `hashContent()` 函数
- [x] 8.3 从 `initPlatformSchema()` 中移除 `resource_state` 表创建
- [x] 8.4 处理 Deleted 状态的 App：`appResolver` 中间件检测到 `deleted` 状态时返回 404，管理路由也拒绝操作
- [x] 8.5 更新 `.gitignore` 模板：确保 `draft/` 目录被忽略

## 9. 自动化测试

- [x] 9.0 搭建测试基础设施：Bun 原生测试运行器 + `tests/helpers/test-workspace.ts` 测试工具 + package.json 测试脚本
- [x] 9.1 自动化测试：新建 App → Draft Reconcile → 查询 seed 数据 → 修改 migration → 再次 Draft Reconcile → 验证数据库重建（`tests/scenarios/reconciler-e2e.test.ts`）
- [x] 9.2 自动化测试：Draft only App → Publish → 验证 stable.sqlite 创建 + `_migrations` 记录 + git commit + draft.sqlite 清理 + App 状态变为 Stable
- [x] 9.3 自动化测试：Stable App 新增 migration → Draft Reconcile → Verify 通过 → Publish → 验证增量 migration 执行 + 备份文件存在
- [x] 9.4 自动化测试：修改已 committed 的 migration 文件 → Verify → 验证报错 "immutable migration"
- [x] 9.5 自动化测试：在 `app.yaml` 中设置 `status: deleted` → 验证所有操作被拒绝
- [x] 9.6 自动化测试：Publish 时故意让 migration SQL 报错 → 验证 stable.sqlite 从备份恢复
- [x] 9.7 单元测试：MigrationRunner（扫描、执行、版本追踪、待执行过滤）
- [x] 9.8 单元测试：SeedLoader（SQL/JSON 加载、错误处理）
- [x] 9.9 单元测试：AppContext（双数据库懒初始化、resetDraft、close 生命周期）
- [x] 9.10 集成测试：Workspace（目录扫描、App 状态推导、git 操作）
- [x] 9.11 集成测试：DraftReconciler（完整 reconcile 流程、错误处理）
- [x] 9.12 集成测试：Verifier（不可变检测、临时数据库验证）
- [x] 9.13 集成测试：Publisher（发布、增量迁移、备份回滚）
