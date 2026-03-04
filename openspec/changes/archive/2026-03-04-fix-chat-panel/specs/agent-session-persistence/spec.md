# Agent Session Persistence

## MODIFIED Requirements

### Requirement: 聊天历史必须按 APP 持久化并在连接时恢复

系统 SHALL 按 APP 持久化用户消息、每条具有实质文本内容的 assistant 消息，以及 tool 摘要消息，并在 WebSocket 连接建立后主动推送该 APP 的历史消息。系统 MUST 保留这些消息的原始产生顺序，而不是将同一轮对话中的多条 assistant 消息折叠为一条。

#### Scenario: 连接后收到历史消息

- **WHEN** 用户连接 APP `orders` 的 chat WebSocket
- **AND** `orders` 已存在历史聊天记录
- **THEN** 服务端 SHALL 主动发送一条 `chat:history` 消息
- **AND** `chat:history.messages` SHALL 按原始时间顺序包含 `orders` 的历史消息

#### Scenario: 历史恢复限制最近消息数量

- **WHEN** 某个 APP 的历史消息数量超过 100 条
- **THEN** 服务端发送的 `chat:history` SHALL 只包含最近 100 条消息
- **AND** 返回的消息顺序 SHALL 保持从旧到新

#### Scenario: 单轮对话中的多条 assistant 文本消息分别持久化

- **WHEN** Agent 在同一轮对话中先后产生多条包含文本内容的 assistant 消息
- **AND** 这些 assistant 消息之间穿插了工具调用或工具摘要消息
- **THEN** 系统 SHALL 为每条 assistant 文本消息分别持久化独立的历史记录
- **AND** 页面刷新或重新连接后 `chat:history` SHALL 按原始顺序恢复这些 assistant 消息

#### Scenario: 纯工具载荷不会生成空 assistant 历史记录

- **WHEN** 某条 assistant 消息只包含工具调用载荷且不包含可展示文本
- **THEN** 系统 MUST NOT 为该消息写入空的 assistant 历史记录
- **AND** 对应的工具过程信息 SHALL 通过 tool 摘要或实时事件单独体现
