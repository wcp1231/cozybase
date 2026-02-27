## 1. 项目结构搭建

- [x] 1.1 创建 `packages/runtime` 目录，初始化 `package.json`（名称 `@cozybase/runtime`，依赖 `hono`、`better-sqlite3` 等）
- [x] 1.2 创建 `packages/daemon` 目录，初始化 `package.json`（名称 `@cozybase/daemon`，依赖 `@cozybase/runtime`）
- [x] 1.3 更新 Workspace 根目录 `package.json`，配置 `workspaces: ["packages/*", "data/apps/*"]`
- [x] 1.4 配置 `packages/runtime/tsconfig.json` 和 `packages/daemon/tsconfig.json`

## 2. Runtime 核心 —— APP 注册表与生命周期

- [x] 2.1 实现 `AppEntry` 接口和 APP 注册表（`Map<string, AppEntry>`，key 格式为 `{appName}:{mode}`）
- [x] 2.2 实现 APP 启动逻辑（打开 SQLite DB 连接、初始化函数模块缓存、状态设为 `running`）
- [x] 2.3 实现 APP 停止逻辑（关闭 DB 连接、清除函数模块缓存、状态设为 `stopped`）
- [x] 2.4 实现 APP 重启逻辑（stop + start，使用新配置）

## 3. Runtime 核心 —— 内部管理 API（已改为 Registry 直接调用）

- [x] 3.1 ~~实现 `POST /internal/apps/:name/start` 路由~~ → 由 Daemon 直接调用 `registry.start()`
- [x] 3.2 ~~实现 `POST /internal/apps/:name/stop` 路由~~ → 由 Daemon 直接调用 `registry.stop()`
- [x] 3.3 ~~实现 `POST /internal/apps/:name/restart` 路由~~ → 由 Daemon 直接调用 `registry.restart()`
- [x] 3.4 ~~实现 `GET /internal/apps/:name/status` 路由~~ → 由 Daemon 直接调用 `registry.get()`
- [x] 3.5 ~~实现 `GET /internal/health` 健康检查路由~~ → Daemon 自有 `/health`
- [x] 3.6 ~~实现 `POST /internal/shutdown` 优雅关闭路由~~ → 由 Daemon 直接调用 `registry.shutdownAll()`

## 4. Runtime 核心 —— 请求中间件

- [x] 4.1 实现 APP 解析中间件（从 URL 的 `:name` 参数和 mode 前缀在注册表中查找 APP 条目，未找到返回 404，已停止返回 503）
- [x] 4.2 实现认证委托中间件（提取 Authorization header，调用 Daemon 的 `POST /internal/auth/verify` 验证，失败返回 401）
- [x] 4.3 实现 `daemonClient` 抽象（同进程使用 `app.request()`，预留分进程切换为 `fetch()` 的能力）

## 5. Runtime 对外路由 —— Functions

- [x] 5.1 迁移 `packages/server/src/modules/functions/routes.ts` 到 `packages/runtime`，适配为从注册表获取函数目录
- [x] 5.2 迁移 `packages/server/src/modules/functions/context.ts`（FunctionContext），适配 DB 连接从注册表条目获取
- [x] 5.3 迁移 `packages/server/src/modules/functions/database-client.ts`（DatabaseClient）到 runtime
- [x] 5.4 迁移 `packages/server/src/modules/functions/logger.ts` 到 runtime
- [x] 5.5 实现函数模块加载逻辑（Draft 模式每次重新加载、Stable 模式使用 moduleCache 缓存）
- [x] 5.6 注册 `/apps/:name/fn/:fnName` 路由，支持所有 HTTP 方法

## 6. Runtime 对外路由 —— DB CRUD

- [x] 6.1 迁移 `packages/server/src/modules/db/routes.ts` 到 `packages/runtime`，适配为从注册表获取 DB 连接
- [x] 6.2 迁移 `packages/server/src/modules/db/crud-handler.ts` 到 runtime
- [x] 6.3 迁移 `packages/server/src/modules/db/query-builder.ts` 到 runtime
- [x] 6.4 注册 DB CRUD 路由：`GET/POST /apps/:name/db/:table`、`GET/PATCH/DELETE /apps/:name/db/:table/:id`
- [x] 6.5 注册 `GET /apps/:name/db/schema` 和 `POST /apps/:name/db/_sql` 路由

## 7. Runtime 对外路由 —— UI Serving

- [x] 7.1 实现 `GET /apps/:name/` 路由，从注册表条目的 `uiDir` 返回 `index.html`
- [x] 7.2 实现 `GET /apps/:name/assets/*` 路由，serve `uiDir/assets/` 下的静态文件
- [x] 7.3 实现 `GET /apps/:name/ui.json` 路由，返回 UI Schema JSON

## 8. Runtime 入口

- [x] 8.1 实现 `createRuntime()` 函数，组装所有路由（对外路由 + 内部管理 API），返回 Hono app 实例
- [x] 8.2 导出 `createRuntime` 作为 `packages/runtime` 的包入口（`src/index.ts`）

## 9. Daemon 重构 —— 路由与启动

- [x] 9.1 将 `packages/server` 复制为 `packages/daemon`
- [x] 9.2 在 Daemon 启动时调用 `createRuntime()` 创建 Runtime 实例
- [x] 9.3 通过 `app.route('/', runtimeApp)` mount Runtime（Runtime 内部包含 `/stable`、`/draft` 前缀路由，不暴露 `/internal`）
- [x] 9.4 实现 Daemon 启动时从 Workspace 读取 APP 列表，逐个调用 `registry.start()` 启动（await 后再 serve）
- [x] 9.5 移除 Daemon 中原有的 Functions 路由、DB CRUD 路由（`src/modules/functions/`、`src/modules/db/` 已删除）
- [x] 9.6 移除 DirectRuntime 及 Publisher 中的 FunctionRuntime 依赖

## 10. Daemon 重构 —— 生命周期联动（已通过 registry 直接调用完成）

- [x] 10.1 ~~修改 APP 创建流程~~ → 创建后由启动逻辑 `registry.start()` 处理
- [x] 10.2 ~~修改 APP 删除流程~~ → 关闭由 `registry.stop()` 处理
- [x] 10.3 修改 Reconcile 流程：Reconcile 完成后调用 `registry.restart(name, { mode: 'draft', ... })`
- [x] 10.4 修改 Publish 流程：Publish 完成后调用 `registry.restart(name, { mode: 'stable', ... })`，并 `registry.stop(name, 'draft')`

## 11. Daemon 重构 —— 认证接口

- [x] 11.1 在 Daemon 中实现 `POST /internal/auth/verify` 内部认证接口（当前为 stub，TODO: 集成实际认证逻辑）
- [x] 11.2 确保认证接口通过 `daemonClient` 抽象可调用（`createInProcessDaemonClient` / `createHttpDaemonClient`）

## 12. APP UI 独立化

- [ ] 12.1 设计 APP UI 构建模板（`index.html` 加载 SchemaRenderer、APP 的 `ui.json`、CSS Variables 主题）
- [ ] 12.2 实现 APP UI 构建流程（Reconcile/Publish 时生成 `uiDir` 下的 `index.html`、`assets/`、`ui.json`）
- [ ] 12.3 实现 APP UI 的 postMessage 监听器（处理 `auth-token`、`theme-update`、`navigate` 消息）
- [ ] 12.4 实现 APP UI 的 postMessage 发送器（发送 `title-changed`、`navigation-changed`、`resize` 消息）

## 13. Admin SPA 改造

- [ ] 13.1 修改 APP 视图页面：从直接渲染 SchemaRenderer 改为 iframe 嵌入（`<iframe src="/stable/apps/:appName/">`）
- [ ] 13.2 实现 Admin 侧 postMessage 通信：加载时发送 `auth-token` 和 `theme-update`，监听 APP 的 `navigation-changed` 和 `title-changed`
- [ ] 13.3 实现侧边栏页面列表通过 `GET /stable/apps/:appName/ui.json` 获取
- [ ] 13.4 实现侧边栏点击通过 postMessage `navigate` 通知 iframe 切换页面
- [ ] 13.5 移除 Admin 中对 `@cozybase/ui` SchemaRenderer 的直接依赖

## 14. 测试与验证

- [ ] 14.1 编写 Runtime 内部管理 API 的单元测试（start/stop/restart/status/health/shutdown）
- [ ] 14.2 编写 Runtime 注册表和生命周期状态转换的单元测试
- [ ] 14.3 编写 Runtime Functions 路由的集成测试（模块加载、缓存、Draft/Stable 行为）
- [ ] 14.4 编写 Runtime DB CRUD 路由的集成测试
- [ ] 14.5 编写 Daemon → Runtime 联动流程的集成测试（启动加载、创建/删除 APP、Reconcile/Publish 后重启）
- [ ] 14.6 验证端到端流程：Daemon 启动 → APP 加载 → 客户端访问 Functions/DB/UI
