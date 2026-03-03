## 1. 数据库 Schema 重构 — name → slug + display_name

- [x] 1.1 修改 `workspace.ts` 中 `apps` 表定义：`name` → `slug TEXT PRIMARY KEY`，新增 `display_name TEXT NOT NULL DEFAULT ''`
- [x] 1.2 修改 `workspace.ts` 中所有 FK 表（`api_keys`、`app_files`、`agent_sessions`、`agent_messages`）的字段：`app_name` → `app_slug`
- [x] 1.3 更新 `workspace.ts` 中所有引用 `name` / `app_name` 的 SQL 查询（INSERT、SELECT、UPDATE、DELETE）

## 2. 后端 AppManager — slug + display_name + auto-reconcile

- [x] 2.1 修改 `manager.ts` 中 `App` / `AppWithFiles` / `CreateAppResult` 接口：`name` → `slug`，新增 `displayName`
- [x] 2.2 修改 `manager.create()` 方法签名，新增 `displayName` 参数，INSERT 语句写入 `slug` 和 `display_name`
- [x] 2.3 在 `manager.create()` 事务完成后添加 auto-reconcile 调用（`DraftReconciler.reconcile(slug)`）
- [x] 2.4 更新 `manager.ts` 中所有其他方法（`list`、`get`、`delete`、`rename` 等）的 SQL 和字段引用：`name` → `slug`，返回值包含 `displayName`
- [x] 2.5 更新 `session-store.ts` 中的 SQL 引用：`app_name` → `app_slug`

## 3. MCP 工具 — create_app schema 变更

- [x] 3.1 修改 `mcp-types.ts` 中 `CreateAppInput` 新增可选 `display_name` 字段，所有 Output 类型中 `name` → `slug` 并新增 `displayName`
- [x] 3.2 修改 `handlers.ts` 中 `handleCreateApp()` 传递 `display_name` 到 `manager.create()`
- [x] 3.3 更新 `sdk-mcp-server.ts` 中 `create_app` 工具的 JSON Schema 定义，新增 `display_name` 参数
- [x] 3.4 更新其他 MCP handler（`handleListApps`、`handleFetchApp` 等）的返回值字段

## 4. LLM 信息提取模块

- [x] 4.1 新建 `packages/daemon/src/agent/extract-app-info.ts`，实现 `extractAppInfo(idea: string)` 函数：调用 `query()` + `claude-haiku`，返回 `{ slug, displayName, description }`
- [x] 4.2 实现 JSON 解析 + 正则 fallback + 默认 slug 生成逻辑
- [x] 4.3 实现 slug 冲突检测与自动追加数字后缀逻辑

## 5. ChatSession — injectPrompt 方法

- [x] 5.1 在 `chat-session.ts` 中新增 `injectPrompt(text: string): Promise<void>` 方法，复用 `handleUserMessage` 的持久化和 query 逻辑
- [x] 5.2 确保 `injectPrompt` 在 streaming 状态下拒绝执行（与串行语义一致）

## 6. HTTP 端点 — POST /api/v1/apps/create-with-ai

- [x] 6.1 在 `server.ts` 中新增 `POST /api/v1/apps/create-with-ai` 路由
- [x] 6.2 实现端点逻辑：校验 idea → 调用 `extractAppInfo` → slug 去重 → `manager.create()` → `chatSessionManager.getOrCreate(slug).injectPrompt(idea)` → 返回 `{ slug }`

## 7. 前端类型与 API 适配

- [x] 7.1 修改 `types.ts` 中 `AppSummary` / `AppInfo` 类型：`name` → `slug`，新增 `displayName` 字段
- [x] 7.2 更新前端所有 API 调用和路由中的 `name` 引用为 `slug`（`home-page.tsx`、`app-page-view.tsx`、`app-layout.tsx` 等）

## 8. 前端 displayName 显示

- [x] 8.1 更新 `app-card.tsx` 显示逻辑：使用 `displayName || slug`
- [x] 8.2 更新 `app-page-view.tsx` 页面标题和面包屑：使用 `displayName || slug`
- [x] 8.3 更新 `home-page.tsx` 列表渲染中的名称显示

## 9. 前端 CreateAppDialog 对接

- [x] 9.1 修改 `create-app-dialog.tsx`：`handleSubmit` 调用 `POST /api/v1/apps/create-with-ai`，成功后调用 `onCreated(slug)` 并导航到 `/apps/<slug>`

## 10. 验证

- [x] 10.1 TypeScript 类型检查通过（`bun run typecheck` 或 `tsc --noEmit`）
- [x] 10.2 前端构建通过（`bun run build`）
- [x] 10.3 daemon 测试：142/147 通过（5 个失败为 pre-existing，非本次变更引入）
