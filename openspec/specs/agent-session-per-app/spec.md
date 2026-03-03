# Agent Session Per App

## Purpose

定义 AI Agent 聊天能力在 APP 维度上的隔离边界，确保不同 APP 之间的会话上下文与连接路由互不污染。
## Requirements
### Requirement: 每个 APP 拥有独立的 Agent session

系统 SHALL 为每个 APP 维护独立的 Agent session 上下文。不同 APP 的用户消息、assistant 回复、tool 执行状态和 SDK resume 状态 MUST NOT 互相复用。

#### Scenario: 切换到另一个 APP 时上下文隔离

- **WHEN** 用户先在 APP `orders` 中完成一轮聊天，再切换到 APP `inventory`
- **THEN** `inventory` 对应的 Agent session SHALL 不包含 `orders` 的对话上下文
- **AND** Agent 后续产生的 assistant 回复和 tool 调用 SHALL 仅针对 `inventory`

#### Scenario: 同一 APP 的后续消息复用该 APP 上下文

- **WHEN** 用户在同一个 APP `orders` 中连续发送多轮消息
- **THEN** 系统 SHALL 将这些消息路由到同一个 `orders` Agent session
- **AND** 后续轮次 SHALL 延续该 APP 既有的对话上下文

### Requirement: Chat WebSocket 连接必须显式绑定 APP

Daemon chat WebSocket endpoint SHALL 只接受显式携带 `app` 参数的连接，并 SHALL 将连接路由到对应 APP 的 Agent session。

#### Scenario: 带 APP 参数的连接建立成功

- **WHEN** 浏览器连接 `/api/v1/chat/ws?app=orders`
- **THEN** 系统 SHALL 将该连接绑定到 APP `orders` 的 Agent session
- **AND** 该连接后续发送的 `chat:send` 消息 SHALL 只影响 `orders` 的会话

#### Scenario: 缺少 APP 参数的连接被拒绝

- **WHEN** 浏览器连接 `/api/v1/chat/ws` 且未提供 `app` query 参数
- **THEN** 系统 SHALL 拒绝该连接
- **AND** HTTP 响应状态 SHALL 为 `400`

### Requirement: Session 生命周期支持 WebSocket 连接前启动

Agent session 的生命周期 SHALL 不依赖浏览器 WebSocket 连接。后端 SHALL 能在 WebSocket 连接建立之前通过 `chatSessionManager` 创建 session 并注入 prompt 启动 Agent 工作。

#### Scenario: APP 创建端点预先创建 session 并注入 prompt

- **WHEN** AI 创建端点成功创建 APP `fitness-tracker`
- **AND** 尚无浏览器 WebSocket 连接到该 APP
- **THEN** 端点 SHALL 通过 `chatSessionManager.getOrCreate("fitness-tracker")` 获取或创建 session
- **AND** 通过 `injectPrompt(idea)` 启动 Agent 工作
- **AND** session SHALL 正常运行，消息持久化到 SessionStore

#### Scenario: Session 在无 WebSocket 期间产生的消息不丢失

- **WHEN** Agent 在无 WebSocket 连接期间完成一轮查询
- **AND** 浏览器随后连接到该 APP 的 chat WebSocket
- **THEN** 该 session 的所有已持久化消息 SHALL 通过 `chat:history` 推送到浏览器
- **AND** 消息内容和顺序 SHALL 与 Agent 实际产生的一致

