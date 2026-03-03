# Agent Chat Service — Delta Spec

## ADDED Requirements

### Requirement: ChatSession 支持无 WebSocket 触发的 injectPrompt

ChatSession SHALL 提供 `injectPrompt(text: string)` 方法，允许后端在无浏览器 WebSocket 连接时主动向 Agent session 注入用户消息并启动 Agent 查询。该方法 SHALL 复用现有的消息处理和持久化逻辑。

#### Scenario: 后端通过 injectPrompt 启动 Agent 工作

- **WHEN** 后端调用 `chatSession.injectPrompt("创建一个健身追踪应用")`
- **AND** 当前没有浏览器 WebSocket 连接到该 session
- **THEN** session SHALL 持久化该用户消息到 SessionStore
- **AND** session SHALL 启动 Agent 查询（调用 `query()`）
- **AND** Agent 产生的消息 SHALL 持久化到 SessionStore
- **AND** WebSocket 推送 SHALL 被静默跳过（ws 为 null）

#### Scenario: injectPrompt 与现有串行语义一致

- **WHEN** 后端调用 `injectPrompt()` 时 session 已有活跃查询（streaming 中）
- **THEN** `injectPrompt()` SHALL 拒绝执行
- **AND** SHALL 抛出错误或返回失败状态

#### Scenario: 浏览器后续连接追赶 injectPrompt 产生的消息

- **WHEN** 后端通过 `injectPrompt()` 启动 Agent 工作
- **AND** Agent 已产生部分或全部回复
- **AND** 浏览器此时建立 WebSocket 连接
- **THEN** session SHALL 通过 `chat:history` 推送所有已持久化的消息（含 injectPrompt 产生的）
- **AND** 若 Agent 仍在 streaming，后续事件 SHALL 实时推送给浏览器
