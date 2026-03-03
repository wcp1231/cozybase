## 1. 数据层：持久化 Schema

- [x] 1.1 在 `packages/daemon/src/core/workspace.ts` 的 `initPlatformSchema()` 中新增 `agent_sessions` 和 `agent_messages` 两张表及索引（使用 `CREATE TABLE IF NOT EXISTS`，兼容已有数据库）
- [x] 1.2 新增 `packages/daemon/src/agent/session-store.ts`，实现 `SessionStore` 类：`getSession` / `saveSessionId` / `deleteSession` / `getMessages` / `addMessage` / `clearMessages` 方法，操作 `platform.sqlite` 中新增的两张表

## 2. 后端核心：ChatSession + ChatSessionManager

- [x] 2.1 将 `packages/daemon/src/agent/chat-service.ts` 重构为 `packages/daemon/src/agent/chat-session.ts`（`ChatSession` 类），核心变化：构造函数接收 `appName` + `SessionStore`；`connect()` 时从 DB 加载并推送 `chat:history` 消息；`handleUserMessage()` 中持久化 user/assistant/tool 消息并保存 `sdkSessionId`
- [x] 2.2 新增 `packages/daemon/src/agent/chat-session-manager.ts`，实现 `ChatSessionManager` 类：`getOrCreate(appName)` 按需创建 `ChatSession` 并从 DB 恢复 `sdkSessionId`；`get(appName)` 获取已有 session；`remove(appName)` 关闭并清理 session；`shutdown()` 关闭所有 session
- [x] 2.3 修改 `packages/daemon/src/agent/system-prompt.ts`，将 `COZYBASE_SYSTEM_PROMPT` 常量改为 `buildSystemPrompt(appName: string)` 函数，在基础 prompt 后追加 `## Current Context` 段落注入 APP 名称

## 3. 后端集成：Server + WebSocket 路由

- [x] 3.1 修改 `packages/daemon/src/server.ts`：用 `ChatSessionManager` 替换 `ChatService` 单例，将 `SessionStore` 注入 manager；返回值中 `chatService` 改为 `chatSessionManager`
- [x] 3.2 修改 `packages/daemon/src/index.ts`（WebSocket 路由）：`/api/v1/chat/ws` 路径下从 URL query param 提取 `app` 参数，无参数时返回 HTTP 400；`ws.data` 中添加 `appName` 字段；`open` / `message` / `close` 回调使用 `chatSessionManager.getOrCreate(ws.data.appName)` 路由到对应 `ChatSession`；shutdown 逻辑中 `chatService.shutdown()` 改为 `chatSessionManager.shutdown()`
- [x] 3.3 修改 `packages/daemon/src/modules/apps/manager.ts`：`delete()` 方法中调用 `chatSessionManager.remove(appName)` 清理内存中的 session；`rename()` 事务中新增 `UPDATE agent_sessions` 和 `UPDATE agent_messages` 的 `app_name` 迁移语句，事务完成后调用 `chatSessionManager.remove(oldName)`

## 4. 前端：WebSocket 按 APP 切换

- [x] 4.1 修改 `packages/web/src/lib/chat-client.ts`：`getChatWsUrl` 函数接受 `appName` 参数，生成 `/api/v1/chat/ws?app=<appName>` URL
- [x] 4.2 修改 `packages/web/src/stores/chat-store.ts`：新增 `activeApp: string | null` 状态和 `setActiveApp(name: string | null)` 方法；`setActiveApp` 执行断开旧 WebSocket → 清空 messages → 按新 appName 重建 WebSocket 连接的序列；`setActiveApp(null)` 断开连接不重连；新增 `chat:history` 消息类型处理（直接替换 `messages` 数组）；移除模块加载时的自动连接逻辑（改为由 `setActiveApp` 驱动）

## 5. 前端：ChatPanel 三态渲染 + Layout 联动

- [x] 5.1 修改 `packages/web/src/features/shell/chat-panel.tsx`：实现三态渲染逻辑 —— `mode === 'stable'` 显示占位 UI（"Home 模式暂不支持 AI 助手"）；`mode === 'draft' && !appName` 显示提示 UI（"请先选择或创建一个应用"）；`mode === 'draft' && appName` 显示正常聊天 UI
- [x] 5.2 修改 `packages/web/src/pages/app-layout.tsx`：新增 `useEffect` 监听 `selectedMode` 和 `appName` 变化，`mode === 'draft' && appName` 时调用 `useChatStore.getState().setActiveApp(appName)`，否则调用 `setActiveApp(null)`

## 6. 清理 + 验证

- [x] 6.1 删除旧的 `packages/daemon/src/agent/chat-service.ts` 文件（逻辑已迁移到 `chat-session.ts`）
- [x] 6.2 端到端验证：TypeScript 类型检查通过，Web 构建成功
