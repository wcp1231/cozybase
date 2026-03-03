# Agent Session Per App — Delta Spec

## ADDED Requirements

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
