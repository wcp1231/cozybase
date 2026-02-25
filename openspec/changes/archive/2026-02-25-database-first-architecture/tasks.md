## 1. Platform DB Schema 扩展

- [x] 1.1 在 `initPlatformSchema()` 中添加 `app_files` 表的 `CREATE TABLE IF NOT EXISTS` 语句
- [x] 1.2 在 `initPlatformSchema()` 中添加 `apps` 表的条件 `ALTER TABLE`（`current_version`、`published_version` 字段），使用 `PRAGMA table_info` 检测后再 ALTER
- [x] 1.3 验证 schema 初始化的幂等性（多次调用 `initPlatformSchema()` 不报错）

## 2. MigrationRunner 和 SeedLoader 接口重构

- [x] 2.1 从 `MigrationFile` 接口中移除 `path` 字段（仅保留 `version`、`name`、`filename`、`sql`）
- [x] 2.2 新增 `MigrationRunner.fromDbRecords(records: { path: string; content: string }[]): MigrationFile[]` 静态方法，复用 `MIGRATION_PATTERN` 正则解析
- [x] 2.3 保留 `scanMigrations(dir)` 方法（旧 workspace 迁移场景使用）
- [x] 2.4 新增 `SeedLoader.loadSeedsFromRecords(db: Database, records: { path: string; content: string }[]): SeedResult` 方法，根据 path 后缀分发 SQL/JSON 处理
- [x] 2.5 添加 `exportFunctionsFromDb(platformDb, appName, targetDir)` 公共方法，从 DB 查询 function 记录并写入目标目录

## 3. AppDefinition 和 AppContext 改造

- [x] 3.1 重构 `AppDefinition` 接口：移除 `dir`、`spec`、`migrations`、`seeds`、`functions` 字段，改为 `name`、`description`、`status`、`current_version`、`published_version`
- [x] 3.2 改造 `AppContext` 构造函数：移除 `specDir`/`appsDir` 参数，只保留 `name`、`dataRootDir`、`draftRootDir`
- [x] 3.3 更新所有引用 `AppDefinition` 旧字段的代码

## 4. Workspace 改造

- [x] 4.1 移除所有 Git 相关代码（`execGit`、`isGitRepo`、`git init`、`git add`、`git commit`、`git status`、`git show` 调用）
- [x] 4.2 移除 `.gitignore` 生成逻辑
- [x] 4.3 移除 `apps/` 目录创建逻辑（init 时只创建 `data/` 和 `draft/`）
- [x] 4.4 移除文件系统 App 扫描逻辑（`scanApps`/`loadAppDefinition` 中的文件扫描），改为从 `apps` 表查询
- [x] 4.5 实现 `loadTemplateApps()`：从 `templates/` 目录读取文件内容写入 `app_files` 和 `apps` 表
- [x] 4.6 实现 `importAppFromDir(appName, dir)` 辅助方法：递归收集目录下所有文件，写入 DB
- [x] 4.7 重写 `refreshAppState()` / `refreshAllAppStates()`：基于 `status`、`published_version`、`current_version` 推导 App 状态，替代 Git status 检测
- [x] 4.8 移除 `hasUnstagedChanges()` 方法

## 5. DraftReconciler 改造

- [x] 5.1 修改 Reconcile 数据来源：从 `app_files` 查询 migration 记录（`WHERE path LIKE 'migrations/%' ORDER BY path`），替代文件系统扫描
- [x] 5.2 修改 Reconcile 数据来源：从 `app_files` 查询 seed 记录（`WHERE path LIKE 'seeds/%' ORDER BY path`），替代文件系统扫描
- [x] 5.3 调用 `MigrationRunner.fromDbRecords()` 和 `SeedLoader.loadSeedsFromRecords()` 替代原有的文件系统方法
- [x] 5.4 修改函数处理：调用 `exportFunctionsFromDb()` 将 function 导出到 `draft/apps/{appName}/functions/`，替代 `copyFileSync` 复制
- [x] 5.5 确保函数验证仍从 `draft/apps/{appName}/functions/` 目录读取验证

## 6. Verifier 改造

- [x] 6.1 移除 Git diff 比较逻辑（`git show HEAD:...` vs 工作区版本）
- [x] 6.2 实现 `checkMigrationImmutability(appName)` 方法：检查 `_migrations` 表中已执行的 version 对应的 `app_files` 记录是否存在且 `immutable = 1`
- [x] 6.3 修改 migration 来源：从 `app_files` 查询替代文件系统读取

## 7. Publisher 改造

- [x] 7.1 移除 Git commit 逻辑（`git add` + `git commit`）
- [x] 7.2 修改 migration 来源：从 `app_files` 查询替代文件系统读取
- [x] 7.3 Publish 成功后标记已执行 migration 的 `app_files.immutable = 1`
- [x] 7.4 Publish 成功后更新 `apps.published_version = current_version`
- [x] 7.5 Publish 时调用 `exportFunctionsFromDb()` 将 function 导出到 `data/apps/{appName}/functions/`
- [x] 7.6 确保 Publish 失败回滚时不更新 `published_version` 和 `immutable`

## 8. Management API

- [x] 8.1 在 AppManager 中扩展 `create()` 方法：创建 APP 时在 `app_files` 中写入模板文件，设置 `current_version = 1`
- [x] 8.2 在 AppManager 中新增 `getAppWithFiles(appName)` 方法：查询 APP 信息和所有 `app_files` 记录
- [x] 8.3 在 AppManager 中新增 `updateApp(appName, files, baseVersion)` 方法：乐观锁校验、immutable 校验、diff 计算、文件 CRUD、递增 `current_version`
- [x] 8.4 在 AppManager 中新增 `updateFile(appName, path, content)` 方法：immutable 校验、UPSERT、递增 `current_version`
- [x] 8.5 在 AppManager 中扩展 `delete()` 方法：删除 `app_files`、`apps`、`api_keys` 记录和文件系统目录
- [x] 8.6 实现 `POST /api/v1/apps` 路由（创建 APP）
- [x] 8.7 实现 `GET /api/v1/apps/:name` 路由（获取 APP 含所有文件）
- [x] 8.8 扩展 `GET /api/v1/apps` 路由（列出所有 APP，包含 version 和 state 信息）
- [x] 8.9 实现 `PUT /api/v1/apps/:name` 路由（整体更新 APP，乐观锁）
- [x] 8.10 实现 `PUT /api/v1/apps/:name/files/*` 路由（单文件更新）
- [x] 8.11 实现 `DELETE /api/v1/apps/:name` 路由（删除 APP）
- [x] 8.12 实现统一错误格式（`VERSION_CONFLICT`、`IMMUTABLE_FILE`、`INVALID_NAME`、`NOT_FOUND`、`ALREADY_EXISTS`）

## 9. MCP 工具集接口定义

- [x] 9.1 定义 MCP 工具集的 TypeScript 类型（`create_app`、`list_apps`、`fetch_app`、`update_app`、`update_app_file`、`delete_app` 的输入输出类型），不实现 MCP Server

## 10. 旧 Workspace 迁移

- [x] 10.1 在 `Workspace.load()` 中添加迁移检测逻辑：`apps/` 目录存在 且 `app_files` 表为空
- [x] 10.2 实现迁移流程：扫描 `apps/` 下所有 APP，将文件内容写入 `app_files` 表
- [x] 10.3 迁移时检查 stable DB 的 `_migrations` 表，标记已执行 migration 为 `immutable = 1`，设置 `published_version`
- [x] 10.4 验证迁移后系统正常启动（reconcile/verify/publish 流程不受影响）

## 11. 清理和验证

- [x] 11.1 移除 Workspace 中已废弃的文件系统扫描相关方法
- [x] 11.2 移除 `app.yaml` 解析相关的 `AppSpec` 类型（如不再需要）
- [x] 11.3 更新 server.ts 初始化流程：移除 Git 降级逻辑，适配新的 Workspace 初始化
- [x] 11.4 端到端验证：启动 → 模板加载 → Reconcile → Verify → Publish → Management API CRUD
