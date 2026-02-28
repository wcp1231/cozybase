## 1. 核心状态模型重构

- [x] 1.1 在 `workspace.ts` 中定义新的 `AppStateInfo` 接口（`stableStatus: 'running' | 'stopped' | null`, `hasDraft: boolean`），移除旧 `AppState` 类型
- [x] 1.2 修改 `apps` 表 schema：在 `initPlatformSchema` 中新增 `stable_status TEXT DEFAULT NULL` 字段
- [x] 1.3 重写 `refreshAppState` 方法：从 `stable_status` 字段和版本号推导 `AppStateInfo`
- [x] 1.4 更新 `_appStates` 缓存类型为 `Map<string, AppStateInfo>`，同步更新 `getAppState`、`refreshAllAppStates`
- [x] 1.5 更新 `AppDefinition` 接口：`status` 字段替换为 `stable_status`

## 2. AppManager 方法变更

- [x] 2.1 修改 `list()` 方法：移除 `WHERE status != 'deleted'` 过滤，返回 `stableStatus` 和 `hasDraft` 替代旧 `state` 字段
- [x] 2.2 修改 `App` / `AppWithFiles` 接口：移除旧 `status` / `state` 字段，新增 `stableStatus` 和 `hasDraft`
- [x] 2.3 修改 `delete()` 方法：新增状态守卫（`stableStatus === 'running'` 时拒绝）
- [x] 2.4 修改 `update()` 方法：移除 `status` 字段的更新支持
- [x] 2.5 新增 `startStable(name)` 方法：校验 → 更新 `stable_status = 'running'` → 刷新状态 → 启动 runtime
- [x] 2.6 新增 `stopStable(name)` 方法：校验 → 更新 `stable_status = 'stopped'` → 刷新状态 → 停止 runtime
- [x] 2.7 新增 `rename(oldName, newName)` 方法：校验守卫和命名规则 → 事务中 INSERT 新记录 + UPDATE app_files/api_keys + DELETE 旧记录 → 重命名文件系统目录 → 更新缓存

## 3. Publisher 变更

- [x] 3.1 修改 `publish` 方法：首次发布（`stable_status` 为 NULL）时设置 `stable_status = 'running'`
- [x] 3.2 修改 `publish` 方法：再次发布时保留已有 `stable_status`（不覆盖）
- [x] 3.3 调整 publish 后的 runtime 行为：`stopped` 的 APP 发布后不启动 stable runtime

## 4. Server 启动逻辑

- [x] 4.1 修改 Daemon 启动时的 APP 加载逻辑：按 `stableStatus === 'running'` 启动 stable runtime，按 `hasDraft` 启动 draft runtime
- [x] 4.2 修改 publish 路由 handler：根据 `stableStatus` 决定是否 restart stable runtime（`stopped` 时跳过）

## 5. REST API 路由

- [x] 5.1 新增 `POST /api/v1/apps/:name/start` 路由，调用 `startStable`
- [x] 5.2 新增 `POST /api/v1/apps/:name/stop` 路由，调用 `stopStable`
- [x] 5.3 新增 `POST /api/v1/apps/:name/rename` 路由，调用 `rename`
- [x] 5.4 修改 `GET /api/v1/apps` 响应格式：返回 `stableStatus` 和 `hasDraft` 替代旧 `state`
- [x] 5.5 修改 `GET /api/v1/apps/:name` 响应格式：同上

## 6. MCP 工具

- [x] 6.1 在 `mcp-types.ts` 中新增 `start_app` 和 `stop_app` 工具的 Zod schema 和描述
- [x] 6.2 在 MCP handler 中实现 `handleStartApp` 和 `handleStopApp`
- [x] 6.3 在 `createMcpServer` 中注册 `start_app` 和 `stop_app` 工具
- [x] 6.4 更新 `delete_app` 工具描述，说明只能删除 stopped 或未发布的 APP
- [x] 6.5 在 `EmbeddedBackend` 和 `RemoteBackend` 中实现 `startApp` / `stopApp` 方法

## 7. Admin UI 适配

- [x] 7.1 更新 `app-layout.tsx` 中的 `AppSummary` 类型：`state` → `stableStatus` + `hasDraft`
- [x] 7.2 修改 `app-list.tsx` 中的 `filterAppsByTab`：stable tab 按 `stableStatus !== null` 过滤，draft tab 按 `hasDraft` 过滤
- [x] 7.3 修改 `app-list.tsx` 中的 Badge 显示：Stable tab 显示 `running`/`stopped`，Draft tab 显示 `draft`/`draft (new)`
- [x] 7.4 修改 `app-list.tsx` 中的 `<Link>` 导航：从 Stable tab 点击导航到 `?mode=stable`，从 Draft tab 导航到 `?mode=draft`
- [x] 7.5 修改 `app-page-view.tsx`：根据 URL 中的 `mode` query param 决定从 `/stable/` 或 `/draft/` 加载 UI

## 8. 编译验证与清理

- [x] 8.1 全局搜索旧 `AppState` 类型和 `status` 字段引用，确保所有都已适配新模型
- [x] 8.2 运行 TypeScript 编译检查，修复所有类型错误
- [x] 8.3 运行现有测试，修复因状态模型变更导致的测试失败
