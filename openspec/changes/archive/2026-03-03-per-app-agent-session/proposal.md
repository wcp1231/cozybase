## Why

当前 AI Agent 的 session 管理存在以下问题：

1. **全局单 session**：`ChatService` 在 `server.ts` 中作为单例创建，所有 WebSocket 连接共享同一个 Claude SDK session。当用户在不同 APP 之间切换时，Agent 的对话上下文会混乱 —— 上一个 APP 的对话会污染下一个 APP 的上下文。

2. **Agent 不感知当前 APP**：虽然 `ChatPanel` 接收 `appName` prop，但这个信息仅用于前端 UI 文案展示，没有传递到后端。Agent 必须通过 `list_apps` / `fetch_app` 工具自行发现 APP，增加了不必要的交互轮次。

3. **Session 无持久化**：`sessionId`（Claude SDK resume token）仅保存在内存中，进程重启后丢失。用户重启 daemon 后看不到任何历史对话，也无法恢复之前的 Agent 上下文。

4. **前端 WebSocket 全局单例**：`chat-store.ts` 在模块加载时创建唯一的 `ChatClient`，连接到固定的 `/api/v1/chat/ws`，不区分当前在操作哪个 APP。

前端已经完成了 Home 模式 / Builder 模式的拆分。AI Agent 的核心使用场景在 Builder 模式：用户进入某个 APP 后，通过 AI 来编辑和管理这个 APP。当前的全局 session 架构无法匹配这个使用模式。

## What Changes

将 AI Agent 的 session 管理从「全局单 session」改造为「每个 APP 一个独立 session」，并实现完整的 session 持久化。

### 后端

- 将 `ChatService` 重构为 `ChatSession`（每个 APP 实例化一个），新增 `ChatSessionManager` 管理多个 session 的生命周期
- 新增 `SessionStore`，在 `platform.sqlite` 中持久化 SDK session ID 和消息历史（新增 `agent_sessions` + `agent_messages` 两张表）
- WebSocket endpoint 从 `/api/v1/chat/ws` 改为 `/api/v1/chat/ws?app=<appName>`，根据 query param 路由到对应的 `ChatSession`
- System prompt 动态化：根据 `appName` 注入当前 APP 上下文，让 Agent 知道自己在编辑哪个 APP
- WebSocket 连接建立时，从 DB 加载历史消息推送给前端（新增 `chat:history` 消息类型）

### 前端

- `chat-store.ts` 新增 `activeApp` 状态和 `setActiveApp(name)` 方法，APP 切换时断开旧 WebSocket、建立新连接
- `ChatPanel` 三态渲染：Home 模式显示占位 UI（功能留空），Builder 列表页显示提示（"请先选择应用"），Builder APP 页正常聊天
- `app-layout.tsx` 联动：监听 `appName` / `mode` 变化，自动调用 `setActiveApp`

## Status

设计方向已确认，可以进入 design + tasks 阶段。

### 已确认的设计决策

1. **纯 APP session**：每个 APP 对应一个 session，不设计全局 session（后续有需要再扩展）
2. **完整持久化**：在 `platform.sqlite` 中持久化 SDK session ID 和消息历史，进程重启后用户可以看到历史对话并恢复 Agent 上下文
3. **Home 模式**：保留 ChatPanel UI 框架，但功能留空不实现，后续再设计
4. **Builder 列表页**：无 APP 上下文时 ChatPanel 显示提示信息，不提供聊天功能
5. **消息存储粒度**：只存前端展示级消息（user/assistant/tool 摘要），不存完整的 SDK streaming delta；SDK 上下文恢复依赖 `resume` 机制
6. **并发控制**：同一个 APP 同时只允许一个 WebSocket 连接（与当前行为一致）

### 不在范围内

- Home 模式的 AI 功能实现
- Builder 列表页的全局 session（通过 AI 创建 APP）
- 消息历史的清空 / 导出功能
- 多用户 / 多 tab 并发编辑同一个 APP 的冲突处理
- SDK session 过期后的优雅降级（MVP 阶段遇到 resume 失败时直接开始新 session）

## Capabilities

### New Capabilities

- `agent-session-per-app`: 每个 APP 独立的 AI Agent session，包含 session 生命周期管理和 WebSocket 路由
- `agent-session-persistence`: Agent session 的持久化能力，包括 SDK session ID 和消息历史的存储与恢复

### Modified Capabilities

- `agent-chat-service`: `ChatService` 重构为 `ChatSession` + `ChatSessionManager`，支持多实例和 APP 上下文感知
- `agent-system-prompt`: system prompt 从静态常量改为根据 APP 上下文动态生成
- `platform-client` (前端): `chat-store` 和 `ChatPanel` 适配 APP 维度的 session 切换

## Impact

- Affected code:
  - `packages/daemon/src/agent/chat-service.ts` — 重构为 `chat-session.ts`（ChatSession 类）
  - `packages/daemon/src/agent/chat-session-manager.ts` — 新增，管理多个 ChatSession 的生命周期
  - `packages/daemon/src/agent/session-store.ts` — 新增，`platform.sqlite` 上的持久化层
  - `packages/daemon/src/agent/system-prompt.ts` — 改为 `buildSystemPrompt(appName)` 函数
  - `packages/daemon/src/core/workspace.ts` — `initPlatformSchema()` 新增 `agent_sessions` + `agent_messages` 表
  - `packages/daemon/src/server.ts` — `chatService` 替换为 `chatSessionManager`
  - `packages/daemon/src/index.ts` — WebSocket 路由改造，从 URL query param 提取 `appName`
  - `packages/daemon/src/modules/apps/manager.ts` — `delete()` 和 `rename()` 中联动清理/迁移 session
  - `packages/web/src/lib/chat-client.ts` — `getChatWsUrl(appName)` 支持 APP 参数
  - `packages/web/src/stores/chat-store.ts` — 新增 `activeApp` / `setActiveApp`，处理 `chat:history` 消息
  - `packages/web/src/features/shell/chat-panel.tsx` — 三态渲染逻辑（Home 占位 / 列表页提示 / APP 页聊天）
  - `packages/web/src/pages/app-layout.tsx` — 监听 mode/appName 变化联动 chat store
- Risk:
  - WebSocket URL 变更是 breaking change，前后端必须同步部署
  - `platform.sqlite` schema 变更需要兼容已有的数据库（使用 conditional ALTER 模式，与现有做法一致）
  - Agent 目录结构（`workspace/agent/apps/`）的文件与 APP 的关联需要与 session 切换保持一致
