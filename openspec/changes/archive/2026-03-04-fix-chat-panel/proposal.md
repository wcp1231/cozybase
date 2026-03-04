## Why

ChatPanel 存在三个核心问题，严重影响 AI Builder 的可用性：

1. **消息丢失**: 每轮对话（turn）中 Agent 可能产生多条 assistant 消息（文本 → 工具调用 → 文本 → 工具调用 → 文本），但后端仅持久化最后一条 assistant 消息。用户刷新页面或从 AI 创建应用流程（`injectPrompt`）跳转过来时，历史消息只剩一条 assistant 回复，中间的上下文全部丢失。
2. **工具调用不可见**: 前端虽有 tool 消息的渲染逻辑，但 SDK 实际发出的消息类型与前端期望的可能不一致，导致工具调用过程对用户不可见，无法了解 Agent 正在做什么。
3. **UI 不刷新**: Agent 调用 `reconcile_app` 后，前端的 `SchemaRenderer` 仍展示旧的 UI schema，用户看不到最新变更，必须手动刷新页面。

## What Changes

- **后端消息持久化修复**: 在 `chat-session.ts` 的 SDK 消息循环中，每遇到 `assistant` 类型消息即时持久化到 `SessionStore`（仅保留有实质文本内容的消息），而非循环结束后只存最后一条。确保 `chat:history` 恢复时消息完整、顺序正确。
- **工具调用消息可见化**: 排查 Claude Agent SDK 实际发出的消息类型，确保 `tool_progress`（或等效事件）和 `tool_use_summary` 正确映射到前端的 `ChatToolMessage`。前端 ChatPanel 中的工具消息改为可折叠/可展开样式（类似 Claude Code 的工具调用展示），区分 running/done/error 状态。
- **reconcile 后自动刷新 UI**: `reconcile_app` MCP handler 执行完毕后，通过现有的 Chat WebSocket 发送 `app:reconciled` 事件。前端 `chat-store` 新增对该事件的处理，触发 `AppLayout` 的 `refreshApp()` 重新拉取 UI schema，`SchemaRenderer` 自动重渲染。

## Capabilities

### Modified Capabilities

- `agent-chat-service`: 修复消息持久化逻辑（每条 assistant 消息即时存储）；新增 `app:reconciled` 事件推送能力
- `agent-session-persistence`: `SessionStore` 的消息存储粒度从"每轮一条 assistant"变为"每条 assistant 即时存储"

## Impact

- **后端**: `chat-session.ts`（assistant 消息即时持久化 + reconcile 事件推送）、`sdk-mcp-server.ts` 或 `handlers.ts`（reconcile 完成后通知 ChatSession）
- **前端**: `chat-store.ts`（处理 `app:reconciled` 事件、验证 tool 消息处理逻辑）、`chat-panel.tsx`（工具消息改为可折叠/可展开 UI）、`app-layout.tsx`（监听 reconcile 事件调用 `refreshApp()`）
- **通信协议**: Chat WebSocket 新增 `app:reconciled` 消息类型
