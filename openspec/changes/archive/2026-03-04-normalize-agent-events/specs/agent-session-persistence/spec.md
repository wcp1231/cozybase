## MODIFIED Requirements

### Requirement: 聊天历史必须按 APP 持久化并在连接时恢复

系统 SHALL 按 APP 持久化用户消息、每条具有实质文本内容的 assistant 消息，以及 tool 摘要消息，并在 WebSocket 连接建立后主动推送该 APP 的历史消息。推送格式 SHALL 使用 `session.history` 事件类型。系统 MUST 保留这些消息的原始产生顺序，而不是将同一轮对话中的多条 assistant 消息折叠为一条。

#### Scenario: 连接后收到历史消息

- **WHEN** 用户连接 APP `orders` 的 chat WebSocket
- **AND** `orders` 已存在历史聊天记录
- **THEN** 服务端 SHALL 主动发送 `{ type: 'session.history', messages: StoredMessage[] }`
- **AND** `messages` SHALL 按原始时间顺序包含 `orders` 的历史消息

#### Scenario: 历史恢复限制最近消息数量

- **WHEN** 某个 APP 的历史消息数量超过 100 条
- **THEN** 服务端发送的 `session.history` SHALL 只包含最近 100 条消息
- **AND** 返回的消息顺序 SHALL 保持从旧到新

#### Scenario: 单轮对话中的多条 assistant 文本消息分别持久化

- **WHEN** Agent 在同一轮对话中先后产生多个 `conversation.message.completed`（role: 'assistant'）事件
- **THEN** 系统 SHALL 为每条 assistant 文本消息分别持久化独立的历史记录
- **AND** 页面刷新或重新连接后 `session.history` SHALL 按原始顺序恢复这些 assistant 消息

#### Scenario: 纯工具载荷不会生成空 assistant 历史记录

- **WHEN** Agent 产生 `conversation.tool.started` 或 `conversation.tool.completed` 事件但没有对应的文本消息事件
- **THEN** 系统 MUST NOT 写入空的 assistant 历史记录
- **AND** 工具过程信息 SHALL 通过 tool 摘要事件单独持久化

### Requirement: APP 级 SDK session 标识必须持久化

系统 SHALL 从 `conversation.run.completed` 事件中提取 `sessionId`，并为每个 APP 持久化该标识，在该 APP 的后续对话中通过 `AgentQueryConfig.resumeSessionId` 传入 provider 以恢复上下文。

#### Scenario: run.completed 触发 session 标识保存

- **WHEN** 某个 APP 的 Agent 查询收到 `conversation.run.completed` 事件
- **THEN** 系统 SHALL 提取事件中的 `sessionId`
- **AND** 系统 SHALL 将该 `sessionId` 持久化到 `agent_sessions` 表中对应 APP 的记录
- **AND** 该 APP 的下次查询 SHALL 将此 `sessionId` 作为 `resumeSessionId` 传入 provider

#### Scenario: Daemon 重启后恢复同一 APP 会话

- **WHEN** 用户在 APP `orders` 中已完成过 Agent 对话（sessionId 已持久化）
- **AND** Daemon 进程重启后用户再次连接 APP `orders` 并发送消息
- **THEN** 系统 SHALL 从 DB 读取已持久化的 sessionId
- **AND** 通过 `AgentQueryConfig.resumeSessionId` 将其传入 provider
