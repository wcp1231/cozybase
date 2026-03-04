## 1. packages/agent/ — 建立 package 并定义类型

- [x] 1.1 创建 `packages/agent/` 目录，添加 `package.json`（name: `@cozybase/agent`，依赖 `@anthropic-ai/claude-agent-sdk`）和 `tsconfig.json`
- [x] 1.2 在 `packages/agent/src/types.ts` 定义 `AgentEvent` union type，包含全部 10 种 `conversation.*` 事件及各字段（`messageId`、`role`、`delta`、`content`、`toolUseId`、`toolName`、`summary`、`sessionId`、`message`）
- [x] 1.3 在 `packages/agent/src/types.ts` 定义 `SessionEvent` union type，包含 `session.connected`、`session.history`、`session.reconciled`、`session.error` 及各字段
- [x] 1.4 在 `packages/agent/src/types.ts` 定义 `AgentProvider`、`AgentQuery`、`AgentQueryConfig` 接口（`AgentQuery extends AsyncIterable<AgentEvent>`，含 `interrupt()` 和 `close()`）
- [x] 1.5 创建 `packages/agent/src/index.ts`，导出所有类型和 provider，在 monorepo 根 `package.json` 的 workspaces 中注册 `packages/agent`

## 2. ClaudeCodeProvider — 实现 SDKMessage → AgentEvent 转换

- [x] 2.1 创建 `packages/agent/src/providers/claude-code.ts`，实现 `ClaudeCodeProvider` 类，在 `createQuery()` 内调用 SDK `query()` 并初始化内部状态（`messageCounter`、`currentMessageId`、`toolUseMap`）
- [x] 2.2 实现 `system` 消息 → `conversation.notice` 的转换
- [x] 2.3 实现 `stream_event`（`content_block_start` + `content_block_delta` 两种子事件）→ `conversation.message.started` + `conversation.message.delta` 的转换，首次 delta 时自动 emit `message.started`
- [x] 2.4 实现 `assistant` 消息拆解：text blocks → `conversation.message.completed`，`tool_use` blocks → `conversation.tool.started`（同时填充 `toolUseMap`）
- [x] 2.5 实现 `tool_progress` → `conversation.tool.progress`、`tool_use_summary` → `conversation.tool.completed`（从 `toolUseMap` 查找 `toolName`）
- [x] 2.6 实现 `result` 转换：success → `conversation.run.completed`（携带 `session_id`），error → `conversation.error`
- [x] 2.7 实现 `user` 类型消息过滤（resume 回放，直接跳过不 emit）
- [x] 2.8 实现 `AgentQuery.interrupt()` 代理到 SDK `Query.interrupt()`，`close()` 代理到 SDK `Query.close()`
- [x] 2.9 在 `createQuery()` 中处理 `AgentQueryConfig.resumeSessionId`：有值时设 `options.resume`，无值时不传

## 3. daemon — ChatSession 改造：消费 AgentEvent

- [x] 3.1 在 `ChatSessionConfig` 中将 `mcpServer: McpSdkServerConfigWithInstance` 替换为 `agentProvider: AgentProvider`，同时保留 `agentDir`、`model` 等字段用于构建 `providerOptions`
- [x] 3.2 移除 `chat-session.ts` 中对 `@anthropic-ai/claude-agent-sdk` 的直接 import（`query`、`Options`、`Query`、`SDKMessage`）
- [x] 3.3 将 `handleUserMessage()` 中的 `query({ prompt, options })` 调用替换为 `agentProvider.createQuery(config)`，`providerOptions` 中包含 `mcpServers`、`tools`、`allowedTools`
- [x] 3.4 将 `for await` 循环从处理 `SDKMessage` 改为处理 `AgentEvent`：`switch (event.type)` 分发 `conversation.*` 事件
- [x] 3.5 移除 `toolUseMap`、`extractTextContent()`、`toolUseMap.clear()` 等 SDK 特有逻辑
- [x] 3.6 更新持久化逻辑：`conversation.message.completed`（role: 'assistant'）→ 写 assistant 消息，`conversation.tool.completed` → 写 tool 消息，`conversation.run.completed` → 保存 `sessionId`，`conversation.error` → 写错误消息

## 4. daemon — 应用层事件重命名为 session.*

- [x] 4.1 `ChatSession.connect()` 中将 `chat:status` 替换为 `session.connected`（保留 `hasSession`、`streaming` 字段）
- [x] 4.2 `ChatSession.connect()` 中将 `chat:history` 替换为 `session.history`（保留 `messages` 字段）
- [x] 4.3 EventBus 回调将 `app:reconciled` 替换为 `session.reconciled`（携带 `appSlug`）
- [x] 4.4 将所有 `{ type: 'chat:error', error }` 替换为 `{ type: 'session.error', message }`（包含无效 JSON 和 Agent 忙两处）
- [x] 4.5 移除 `chat:streaming` 消息的发送（streaming 状态通过 `conversation.run.started/completed` 传递），并删除相关代码

## 5. daemon — 初始化改造

- [x] 5.1 在 `packages/daemon/src/server.ts` 中创建 `ClaudeCodeProvider` 实例（import from `@cozybase/agent`）
- [x] 5.2 将 `sdk-mcp-server.ts` 的 `createCozybaseSdkMcpServer()` 调用保留在 daemon 侧，将其结果作为 `providerOptions.mcpServers` 的值
- [x] 5.3 通过 `ChatSessionConfig.agentProvider` 将 provider 注入 `ChatSessionManager`，更新 `packages/daemon/package.json` 添加 `@cozybase/agent` 依赖

## 6. 清理

- [x] 6.1 删除空目录 `packages/sdk/`

## 7. web — chat-store.ts 改造：消费统一事件

- [x] 7.1 移除 `streamBuffer`、`isAccumulating` 模块变量，添加 `messageIndex: Map<string, number>`（`messageId → 消息列表 index`）和 `toolIndex: Map<string, number>`（`toolUseId → 消息列表 index`）
- [x] 7.2 移除 `extractTextContent()`、`extractToolUseBlocks()` 函数
- [x] 7.3 实现 `conversation.message.started`：在消息列表末尾追加空消息并在 `messageIndex` 记录 index
- [x] 7.4 实现 `conversation.message.delta`：通过 `messageIndex` 定位消息条目，追加 `delta` 到 `content`
- [x] 7.5 实现 `conversation.message.completed`：通过 `messageIndex` 定位消息条目，替换 `content` 为最终文本，清除 map 记录
- [x] 7.6 实现 `conversation.tool.started`：追加 running tool 消息并在 `toolIndex` 记录 index
- [x] 7.7 实现 `conversation.tool.completed`：通过 `toolIndex` 定位 tool 消息，更新为 done 状态并设置 `summary`
- [x] 7.8 实现 `conversation.run.started`（设 `streaming = true`）和 `conversation.run.completed`（设 `streaming = false`）
- [x] 7.9 实现 `conversation.error`：追加错误 assistant 消息，设 `streaming = false`
- [x] 7.10 将 `chat:status` handler 替换为 `session.connected`（同步 `connected` 和 `streaming`）
- [x] 7.11 将 `chat:history` handler 替换为 `session.history`
- [x] 7.12 将 `app:reconciled` handler 替换为 `session.reconciled`
- [x] 7.13 删除 `chat:streaming` 和 `chat:error` 的 handler，確认不再产生这两种消息
- [x] 7.14 在 `packages/web/package.json` 中添加 `@cozybase/agent` 依赖，并在 import 中使用统一类型

## 8. 验证

- [ ] 8.1 端到端验证：发送消息后流式 delta 正确逐字追加，`message.completed` 到达后文本完整替换
- [ ] 8.2 验证工具调用展示：Agent 调用工具时显示 running 状态，完成后切换为 done 并展示 summary
- [x] 8.3 验证历史恢复：断开并重连 WebSocket 后，`session.history` 正确还原消息列表
- [x] 8.4 验证 App 刷新：Agent 调用 `reconcile_app` 后前端 `SchemaRenderer` 自动使用最新 UI schema
- [x] 8.5 验证 session resume：记录 `run.completed` 的 `sessionId`，daemon 重启后发送新消息仍在同一 Claude 会话上下文中
