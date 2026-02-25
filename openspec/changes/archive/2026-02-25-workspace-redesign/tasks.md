## 1. Config 简化

- [x] 1.1 修改 `packages/server/src/config.ts`：移除 `dataDir` 字段和 `--data` CLI 参数，将 `workspaceDir` 默认值改为 `$HOME/.cozybase`（使用 `os.homedir()`）

## 2. AppContext 实现

- [x] 2.1 创建 `packages/server/src/core/app-context.ts`：实现 AppContext 类，包含 name、paths（specDir、dataDir、dbPath）、definition、db getter（懒初始化 SQLite 连接 + WAL 模式）、reload()、close() 方法
- [x] 2.2 实现 AppContext 的 DB 懒初始化逻辑：首次访问 `db` 时自动创建数据目录、打开连接、配置 PRAGMA

## 3. Workspace 类实现

- [x] 3.1 重写 `packages/server/src/core/workspace.ts`：创建 Workspace 类，包含 root/appsDir/dataDir 路径属性、apps Map、platformDb 引用。保留现有的 Zod schema 定义和类型导出（AppDefinition、TableSpec、ColumnSpec、IndexSpec）
- [x] 3.2 实现 `isInitialized()` 和 `init()` 方法：检测 workspace.yaml 是否存在，不存在时自动创建目录结构、写入 workspace.yaml 和 .gitignore、git init、创建示例 app（apps/hello/app.yaml）、执行初始 commit。git 不可用时降级跳过
- [x] 3.3 实现 `load()` 方法：解析 workspace.yaml（校验 name + version schema version）、初始化 platform DB（迁移 DbPool.initPlatformSchema 逻辑）
- [x] 3.4 实现 `scanApps()` 方法：扫描 apps/ 目录，复用现有 scanWorkspace/loadAppDefinition 逻辑（扫描路径从 workspaceDir 改为 appsDir）
- [x] 3.5 实现 `getApp()` 和 `getOrCreateApp()` 方法：Hybrid 策略——从 apps Map 缓存中获取，不存在时检测 app.yaml 是否存在、加载定义、创建 AppContext 并缓存
- [x] 3.6 实现 `getPlatformDb()` 方法：懒初始化 platform SQLite 连接（data/platform.sqlite），创建系统表（apps、platform_users、api_keys、resource_state）
- [x] 3.7 实现 `commit(message)` 方法：使用 Bun.spawn 调用 git CLI，执行 git add apps/ && git commit。无变更时跳过，git 失败时打印警告不阻塞
- [x] 3.8 实现 `close()` 方法：遍历关闭所有 AppContext，关闭 platform DB 连接

## 4. Reconciler 适配

- [x] 4.1 修改 `packages/server/src/core/reconciler.ts`：构造函数参数从 `DbPool + Config` 改为 `Workspace`
- [x] 4.2 将 `reconcileAll()` 中 `scanWorkspace(config.workspaceDir)` 改为 `this.workspace.scanApps()`，`dbPool.getPlatformDb()` 改为 `this.workspace.getPlatformDb()`
- [x] 4.3 将 `reconcileApp()` 中 `dbPool.getAppDb(app.name)` 改为 `this.workspace.getOrCreateApp(app.name).db`
- [x] 4.4 在 `reconcileAll()` 成功后调用 `this.workspace.commit()` 进行 git auto-commit

## 5. Middleware 适配

- [x] 5.1 修改 `packages/server/src/middleware/app-resolver.ts`：参数从 `Config` 改为 `Workspace`，调用 `workspace.getOrCreateApp(appName)` 获取 AppContext，`c.set('appContext', appContext)` 注入到请求 context。更新 `AppEnv` 类型定义

## 6. Routes 适配

- [x] 6.1 修改 `packages/server/src/modules/db/routes.ts`：移除 `DbPool` 参数，所有 handler 从 `c.get('appContext').db` 获取数据库连接，替换所有 `dbPool.getAppDb(appName)` 调用
- [x] 6.2 修改 `packages/server/src/modules/apps/routes.ts`：参数从 `DbPool + Config + Reconciler` 改为 `Workspace + Reconciler`，使用 `workspace.scanApps()` 和 `workspace.getPlatformDb()`
- [x] 6.3 修改 `packages/server/src/modules/apps/manager.ts`：依赖从 `DbPool + Config` 改为 `Workspace`，使用 `workspace.getPlatformDb()` 和 `workspace.getOrCreateApp()`

## 7. Server 组装和入口

- [x] 7.1 修改 `packages/server/src/server.ts`：使用 Workspace 替代 DbPool，创建 Workspace 实例并执行 init/load，移除 WorkspaceWatcher 初始化，将 workspace 传递给 Reconciler、middleware、routes
- [x] 7.2 修改 `packages/server/src/index.ts`：shutdown handler 中用 `workspace.close()` 替代 `dbPool.closeAll()` + `watcher.stop()`

## 8. 清理旧代码

- [x] 8.1 删除 `packages/server/src/core/db-pool.ts`
- [x] 8.2 删除 `packages/server/src/core/watcher.ts`
- [x] 8.3 删除或移动 `my-workspace/` 示例目录（已被 workspace 自动初始化的 apps/hello 替代）

## 9. 验证

- [x] 9.1 运行 `bun run dev` 验证 server 正常启动：workspace 自动初始化、platform DB 创建、示例 app 扫描成功
- [x] 9.2 测试 reconcile API（`POST /api/v1/reconcile`）：添加/修改 YAML spec 后手动触发 reconcile，确认表结构正确创建，git commit 自动生成
- [x] 9.3 测试 CRUD API：通过 `GET/POST/PATCH/DELETE /api/v1/app/{appName}/db/{table}` 验证请求通过 AppContext 正常处理
