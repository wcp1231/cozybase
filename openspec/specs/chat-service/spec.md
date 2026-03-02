# Chat Service

## Purpose

定义 Admin UI 聊天通道与 daemon 中 AI Agent 会话之间的桥接机制，包括 session 生命周期、消息转发和 WebSocket endpoint。

## Requirements

### Requirement: ChatService 管理 SDK Session 生命周期
系统 SHALL 提供 `ChatService` 类，负责创建和管理 `SDKSession` 实例。

ChatService SHALL 使用以下配置创建 session：
- `model`: 可配置的模型标识（默认 `claude-sonnet-4-6`）
- `permissionMode`: `acceptEdits`
- `allowedTools`: 包含 `Read`、`Edit`、`Write`、`Bash`、`Glob`、`Grep`
- `mcpServers`: 包含 cozybase SDK MCP Server
- `cwd`: Agent 工作目录路径
- `systemPrompt`: Cozybase 专用 system prompt

MVP 阶段 SHALL 仅支持单个 session，同一时间只有一个活跃的 Agent 会话。

#### Scenario: 首次浏览器连接创建 session
- **WHEN** 浏览器首次通过 WebSocket 连接且没有活跃 session
- **THEN** ChatService 创建新的 SDKSession 并开始监听其消息流

#### Scenario: 浏览器断开后 session 保持存活
- **WHEN** 浏览器 WebSocket 连接断开
- **THEN** SDKSession 保持存活状态，不销毁

#### Scenario: 浏览器重连复用 session
- **WHEN** 浏览器重新连接且存在活跃 session
- **THEN** ChatService 将新的 WebSocket 连接关联到现有 session，不创建新 session

### Requirement: 用户消息转发到 SDK Session
系统 SHALL 将浏览器发送的用户消息转发到 SDKSession。

#### Scenario: 发送用户消息
- **WHEN** 浏览器通过 WebSocket 发送 `{ type: "chat:send", message: "..." }` 消息
- **THEN** ChatService 调用 `session.send()` 将消息内容传递给 Agent

#### Scenario: 取消 Agent 执行
- **WHEN** 浏览器发送 `{ type: "chat:cancel" }`
- **THEN** ChatService 终止当前 session 并创建新 session

### Requirement: SDK 消息流式转发到浏览器
系统 SHALL 将 SDKSession 的 `stream()` 输出实时转发到浏览器 WebSocket。

转发的消息类型 SHALL 包含：
- `stream_event` — 文本增量（用于实时打字效果）
- `assistant` — 完整的 assistant 消息
- `tool_progress` — 工具执行进度
- `tool_use_summary` — 工具使用摘要
- `result` — 对话回合结果（成功或错误）
- `system` (subtype: `task_started`, `task_notification`, `task_progress`) — 子任务状态

#### Scenario: 流式文本输出
- **WHEN** SDK Session 产生 `stream_event` 类型的消息（包含 `content_block_delta`）
- **THEN** 该消息 SHALL 立即通过 WebSocket 转发到浏览器，实现打字效果

#### Scenario: 工具执行状态
- **WHEN** Agent 开始执行一个 MCP 工具调用
- **THEN** 浏览器 SHALL 收到 `tool_progress` 消息，包含工具名称和执行时间

#### Scenario: 回合完成
- **WHEN** Agent 完成一轮对话
- **THEN** 浏览器 SHALL 收到 `result` 消息，包含最终结果文本

#### Scenario: 浏览器未连接时消息丢弃
- **WHEN** SDK Session 产生消息但没有浏览器 WebSocket 连接
- **THEN** 消息 SHALL 被丢弃，不缓存

### Requirement: Chat WebSocket Endpoint
系统 SHALL 在 `/api/v1/chat/ws` 路径上提供 WebSocket endpoint，用于 Admin UI Chat Window 与 ChatService 的双向通信。

该 endpoint SHALL 与现有的 `/api/v1/agent/ws`（UiBridge）共存，通过 Bun WebSocket upgrade 时附加的 `data.type` 区分连接类型。

#### Scenario: WebSocket 连接建立
- **WHEN** 浏览器向 `/api/v1/chat/ws` 发起 WebSocket upgrade 请求
- **THEN** 服务器 SHALL 完成 upgrade 并将连接交给 ChatService 管理

#### Scenario: 与 Agent Bridge 共存
- **WHEN** 浏览器同时建立 `/api/v1/agent/ws` 和 `/api/v1/chat/ws` 连接
- **THEN** 两个连接 SHALL 独立工作，分别由 UiBridge 和 ChatService 处理
