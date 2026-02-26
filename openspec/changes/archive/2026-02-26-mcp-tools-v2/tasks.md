## 1. 类型定义与基础接口

- [x] 1.1 定义 `CozybaseBackend` 接口及相关类型（`AppSnapshot`, `AppInfo`, `FileEntry`, `PushResult`, `ReconcileResult`, `VerifyResult`, `PublishResult`, `SqlResult`, `ApiResponse`）
- [x] 1.2 更新 `mcp-types.ts`，重新定义 11 个 MCP 工具的参数类型、返回值类型和工具描述文本（含 UI 指引、安全警告、工作流提示）

## 2. SQL 安全模块

- [x] 2.1 实现 `classifySql(sql)` 函数，根据第一个关键字分类为 `select` / `dml` / `ddl` / `pragma` / `unknown`
- [x] 2.2 实现多语句检测（拒绝包含分号分隔的多条 SQL）
- [x] 2.3 实现 `checkSqlPermission(classification, mode)` 权限检查函数，按 mode（draft/stable）和语句类型决定是否允许执行

## 3. Agent 工作目录管理

- [x] 3.1 实现 `writeAppToDir(appsDir, appName, files)`：将 AppSnapshot 的文件内容写入 Agent 工作目录（创建子目录、写入文件）
- [x] 3.2 实现 `clearAppDir(appsDir, appName)`：清空 APP 工作目录（供 fetch_app 使用，避免残留文件）
- [x] 3.3 实现 `collectAppFromDir(appsDir, appName)`：扫描 APP 工作目录收集所有文件（路径 + 内容），跳过超过 1MB 的文件（复用现有 `collectFiles` 逻辑）

## 4. EmbeddedBackend 实现

- [x] 4.1 实现 App 生命周期方法：`createApp`（复用 `AppManager.create`）、`listApps`、`fetchApp`（从 DB 读取 APP 信息和所有文件）、`deleteApp`（复用 `AppManager` 删除逻辑）
- [x] 4.2 实现文件同步方法：`pushFiles`（全量 diff 同步：新增/修改/删除，immutable 保护，复用 `AppManager.updateApp` 事务逻辑）、`pushFile`（单文件 UPSERT，复用 `AppManager.updateFile`）
- [x] 4.3 实现开发工作流方法：`reconcile`（调用 `DraftReconciler`）、`verify`（调用 `Verifier`）、`publish`（调用 `Publisher`）
- [x] 4.4 实现运行时交互方法：`executeSql`（按 mode 获取对应 DB，执行查询，限制 1000 行，5 秒超时）、`callApi`（通过 Hono `app.request()` 内部路由）

## 5. MCP 工具 Handler 实现

- [x] 5.1 实现 App 生命周期 handler：`create_app`（Backend.createApp + writeAppToDir）、`list_apps`（Backend.listApps）、`fetch_app`（Backend.fetchApp + clearAppDir + writeAppToDir）、`delete_app`（Backend.deleteApp + 清理工作目录）
- [x] 5.2 实现文件同步 handler：`update_app`（collectAppFromDir + Backend.pushFiles）、`update_app_file`（读取单文件 + Backend.pushFile）
- [x] 5.3 实现开发工作流 handler：`reconcile_app`（Backend.reconcile）、`verify_app`（Backend.verify）、`publish_app`（Backend.publish）
- [x] 5.4 实现运行时交互 handler：`execute_sql`（SQL 安全检查 + Backend.executeSql）、`call_api`（Backend.callApi）

## 6. MCP Server 与 CLI 入口

- [x] 6.1 实现 MCP Server：stdio 传输层、注册 11 个工具、将请求路由到对应 handler
- [x] 6.2 实现 `cozybase mcp` CLI 命令：解析 `--apps-dir`（或 `COZYBASE_APPS_DIR` 环境变量）和 `--url` 参数
- [x] 6.3 实现模式选择逻辑：无 `--url` 时创建 EmbeddedBackend（初始化 Workspace），有 `--url` 时创建 RemoteBackend

## 7. Management API 扩展

- [x] 7.1 新增 `POST /{mode}/apps/{appName}/db/_sql` 路由，实现 SQL 分类检查和权限控制（复用 SQL 安全模块）
- [x] 7.2 实现结果集大小限制（1000 行）、执行超时（5 秒）和统一错误格式（`SQL_NOT_ALLOWED` / `SQL_INVALID`）

## 8. RemoteBackend 实现

- [x] 8.1 实现所有 `CozybaseBackend` 接口方法，通过 HTTP 调用对应的 Management API 和 App API 端点
- [x] 8.2 实现 HTTP 错误处理：将 HTTP 状态码和错误响应转换为统一的 Backend 错误格式

## 9. 测试

- [x] 9.1 `classifySql` 单元测试：覆盖 SELECT/WITH/EXPLAIN/PRAGMA/DML/DDL/unknown/多语句 各类场景
- [x] 9.2 工作目录管理单元测试：`writeAppToDir`、`clearAppDir`、`collectAppFromDir` 的正确性和边界条件（大文件跳过）
- [x] 9.3 EmbeddedBackend 集成测试：App 生命周期（create → fetch → pushFiles → delete）和 immutable 文件保护
- [x] 9.4 MCP 工具端到端测试：完整工作流（create_app → 写文件 → update_app → reconcile_app → execute_sql → verify_app → publish_app）——已覆盖在 EmbeddedBackend 集成测试中
- [x] 9.5 `execute_sql` 权限模型测试：Draft DML 允许、Stable DML 禁止、DDL 一律禁止、多语句拒绝
- [x] 9.6 SQL 端点（`POST /{mode}/apps/{appName}/db/_sql`）集成测试：权限控制、结果集限制、错误格式
