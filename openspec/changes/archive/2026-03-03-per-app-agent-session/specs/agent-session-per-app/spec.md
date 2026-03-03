# Agent Session Per App

## ADDED Requirements

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
