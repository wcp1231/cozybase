## Why

当前 Cozybase 的 AI Agent 集成与 Claude Agent SDK 深度耦合，存在以下问题：

1. **前端直接消费 SDK 原始消息**: `chat-store.ts` 的 `handleMessage()` 需要处理 `stream_event`、`assistant`、`tool_progress`、`tool_use_summary`、`result`、`system` 等 Claude SDK 特有的消息类型，包括多层嵌套结构（如 `msg.event.delta.type === 'text_delta'`）。一旦切换或新增 Agent 厂商，前端需要同步改动。

2. **后端消息处理包含 SDK 特有逻辑**: `chat-session.ts` 中需要从 `assistant` 消息的 `content blocks` 数组里手动提取 `text` 块和 `tool_use` 块，维护 `toolUseMap` 来从 `tool_use_summary` 反查工具名称，这些都是 Claude SDK 的实现细节。

3. **前端 streaming 状态管理脆弱**: 前端使用 `streamBuffer` + `isAccumulating` 两个模块级变量来追踪流式消息状态，因为 Claude SDK 没有明确的"消息开始"信号，前端必须自己推断消息生命周期。

4. **WebSocket 消息命名不规范**: 应用层事件（`chat:status`、`chat:history`、`chat:streaming`、`app:reconciled`）与 Agent 事件（SDK 原始消息直接透传）混在一起，没有统一的命名规范。

5. **无法支持多厂商**: 长期目标是支持 Claude Code、OpenAI Codex 等多种 AI Coding Agent。缺少统一的事件抽象层意味着每增加一个厂商，前端和后端的消息处理逻辑都要翻倍。

## What Changes

引入统一的 Agent 事件格式（Normalized Agent Events），将 Claude SDK 的原始消息转换为厂商无关的标准事件流。

### 1. 定义统一事件格式

新增 `packages/agent/` package，定义两套事件类型：

**Agent Events (`conversation.*`)** — Agent 执行产生的事件：

| 事件 | 用途 |
|------|------|
| `conversation.run.started` | 一次 agent query 开始 |
| `conversation.run.completed` | query 结束，携带 sessionId |
| `conversation.message.started` | AI 文本输出开始，携带 messageId + role |
| `conversation.message.delta` | 流式文本增量 |
| `conversation.message.completed` | 文本输出结束，携带完整内容 |
| `conversation.tool.started` | 工具调用开始 |
| `conversation.tool.progress` | 工具执行中 |
| `conversation.tool.completed` | 工具执行完成，携带摘要 |
| `conversation.notice` | 系统/信息通知 |
| `conversation.error` | Agent 执行错误 |

**Session Events (`session.*`)** — 应用层会话管理事件：

| 事件 | 用途 | 替代 |
|------|------|------|
| `session.connected` | WebSocket 连接建立，携带初始状态 | 原 `chat:status` |
| `session.history` | 历史消息回放 | 原 `chat:history` |
| `session.reconciled` | App 重建完成通知 | 原 `app:reconciled` |
| `session.error` | 会话级错误（无效 JSON、Agent 忙等） | 原 `chat:error` |

`chat:streaming` 被消除 — 前端从 `conversation.run.started` / `conversation.run.completed` 推导 streaming 状态。

### 2. 实现 Claude SDK Provider

在 `packages/agent/` 中实现 Claude Code provider，将 SDKMessage 转换为 AgentEvent：

- `system` → `conversation.notice`
- `stream_event (text_delta)` → `conversation.message.delta`（Provider 内部跟踪 messageId，首次 delta 时先发 `message.started`）
- `assistant (text blocks)` → `conversation.message.completed`
- `assistant (tool_use blocks)` → `conversation.tool.started`
- `tool_progress` → `conversation.tool.progress`
- `tool_use_summary` → `conversation.tool.completed`（Provider 内部维护 toolUseId → toolName 映射）
- `result (success)` → `conversation.run.completed`
- `result (error)` → `conversation.error`

### 3. 改造 daemon 消费层

`ChatSession` 改为消费 `AgentEvent` 而非 `SDKMessage`：
- 移除 `toolUseMap`、`extractTextContent()`
- 事件持久化逻辑简化为 `switch (event.type)` 直接处理
- `chat:status` / `chat:history` / `app:reconciled` 改发对应的 `session.*` 事件

### 4. 改造前端消费层

`chat-store.ts` 改为消费统一事件：
- 移除 `streamBuffer`、`isAccumulating` 状态变量
- 移除 `extractTextContent()`、`extractToolUseBlocks()` 函数
- 使用 `messageId` 索引定位消息，`message.delta` 直接追加、`message.completed` 直接替换

## Capabilities

### New Capabilities

- `agent-event-types`: 统一 Agent 事件格式定义（`AgentEvent` union type），包含 `conversation.*` 系列事件和 `session.*` 系列事件
- `agent-provider-claude`: Claude Agent SDK 适配器，将 SDKMessage 流转换为 AgentEvent 流，封装 `query()` / `interrupt()` / `close()` / session resume 等操作

### Modified Capabilities

- `agent-chat-service`: `ChatSession` 从直接消费 `SDKMessage` 改为消费 `AgentEvent`；WebSocket 消息格式从混合命名改为 `conversation.*` + `session.*` 规范命名
- `agent-session-persistence`: 持久化逻辑适配新事件类型（从 `msg.type === 'assistant'` 改为 `event.type === 'conversation.message.completed'`）
- `platform-client` (前端): `chat-store.ts` 消息处理从 SDK 原始格式改为统一事件格式

## Impact

- Affected packages:
  - `packages/agent/` — **新增 package**，包含事件类型定义和 Claude Code provider 实现
  - `packages/daemon/src/agent/chat-session.ts` — 消费 AgentEvent 替代 SDKMessage，移除 toolUseMap 和 SDK 消息解析逻辑
  - `packages/daemon/src/agent/chat-session-manager.ts` — 类型引用更新
  - `packages/daemon/src/agent/sdk-mcp-server.ts` — 移至 `packages/agent/` 或由 provider 内部管理
  - `packages/daemon/src/index.ts` — Provider 初始化和注入
  - `packages/web/src/stores/chat-store.ts` — 消费统一事件，移除 SDK 特有解析逻辑和 streaming buffer hack
  - `packages/sdk/` — 删除（空目录，无用）
- Breaking change:
  - WebSocket 消息格式变更（`chat:*` → `session.*`，SDK 原始消息 → `conversation.*`），前后端必须同步部署
- Risk:
  - Provider 转换层引入了一层间接性，需确保所有 SDKMessage 类型都有正确映射，不遗漏关键信息
  - `message.started` 的时机依赖对 Claude SDK streaming 行为的正确检测（`content_block_start` 事件）
  - `extract-app-info.ts` 直接使用 `query()` 做轻量 LLM 调用，暂不纳入抽象层，后续考虑
