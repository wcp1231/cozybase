## ADDED Requirements

### Requirement: AgentEvent 必须覆盖 Agent 执行的完整事件生命周期

系统 SHALL 定义 `AgentEvent` union type，通过 `type` 字段进行 discriminated union 区分，涵盖运行状态、消息输出、工具调用、通知和错误五类事件。所有事件 SHALL 以 `conversation.` 作为命名前缀。`AgentEvent` 的定义 SHALL 位于 `packages/agent/src/types.ts`，由 daemon 和 web 共同引用。

#### Scenario: run 事件覆盖一次查询的起止

- **WHEN** Agent provider 开始处理一次 prompt
- **THEN** SHALL 首先 emit `{ type: 'conversation.run.started' }`
- **AND** 查询正常结束时 SHALL emit `{ type: 'conversation.run.completed', sessionId: string }`
- **AND** `sessionId` SHALL 可用于下次查询的 session 恢复

#### Scenario: run 出错时 emit conversation.error

- **WHEN** Agent provider 执行过程中遇到错误（如 API 错误、超出轮次等）
- **THEN** SHALL emit `{ type: 'conversation.error', message: string }`
- **AND** MUST NOT emit `conversation.run.completed`

#### Scenario: message 事件通过 messageId 关联生命周期

- **WHEN** AI 开始输出一段文本（assistant 文本或 thinking 内容）
- **THEN** provider SHALL emit `{ type: 'conversation.message.started', messageId: string, role: 'assistant' | 'thinking' }`
- **AND** 流式增量 SHALL 通过 `{ type: 'conversation.message.delta', messageId: string, role: 'assistant' | 'thinking', delta: string }` 传递
- **AND** 文本输出完成时 SHALL emit `{ type: 'conversation.message.completed', messageId: string, role: 'assistant' | 'thinking', content: string }`
- **AND** 同一消息的三个事件 SHALL 携带相同的 `messageId`

#### Scenario: message 事件的 role 在 delta 和 completed 中保持一致

- **WHEN** 消费端收到 `conversation.message.delta` 或 `conversation.message.completed`
- **THEN** 事件中携带的 `role` SHALL 与同 `messageId` 的 `conversation.message.started` 一致
- **AND** 消费端 MUST NOT 需要维护 `messageId → role` 的外部映射表来推断 role

#### Scenario: tool 事件通过 toolUseId 关联生命周期

- **WHEN** AI 发起一次工具调用
- **THEN** provider SHALL emit `{ type: 'conversation.tool.started', toolUseId: string, toolName: string }`
- **AND** 工具执行期间 SHALL emit `{ type: 'conversation.tool.progress', toolUseId: string, toolName: string }`
- **AND** 工具执行完成后 SHALL emit `{ type: 'conversation.tool.completed', toolUseId: string, toolName: string, summary: string }`
- **AND** 同一工具调用的三个事件 SHALL 携带相同的 `toolUseId`

#### Scenario: conversation.notice 传递非关键系统信息

- **WHEN** Agent provider 收到系统初始化或状态通知类消息
- **THEN** SHALL 转换为 `{ type: 'conversation.notice', message: string }`
- **AND** 消费端 SHOULD 可安全忽略该事件而不影响核心功能

### Requirement: SessionEvent 必须覆盖应用层 WebSocket 会话的管理语义

系统 SHALL 定义 `SessionEvent` union type，所有事件以 `session.` 作为命名前缀，用于传达会话连接状态、历史数据和应用层通知。`SessionEvent` 的定义 SHALL 位于 `packages/agent/src/types.ts`。

#### Scenario: session.connected 传递连接建立时的初始状态

- **WHEN** 浏览器 WebSocket 连接建立成功
- **THEN** 服务端 SHALL 推送 `{ type: 'session.connected', hasSession: boolean, streaming: boolean }`
- **AND** `hasSession` SHALL 表示该 APP 是否已有可恢复的 SDK session
- **AND** `streaming` SHALL 表示该 APP 的 Agent 当前是否正在执行查询（用于重连后恢复 UI 状态）

#### Scenario: session.history 传递历史消息

- **WHEN** 浏览器 WebSocket 连接建立且该 APP 有已持久化的历史消息
- **THEN** 服务端 SHALL 推送 `{ type: 'session.history', messages: StoredMessage[] }`
- **AND** messages SHALL 按时间从旧到新排序

#### Scenario: session.reconciled 通知 APP 构建完成

- **WHEN** 某个 APP 的 `reconcile_app` 执行完成
- **THEN** 服务端 SHALL 向该 APP 的活跃 WebSocket 推送 `{ type: 'session.reconciled', appSlug: string }`

#### Scenario: session.error 传递会话级错误

- **WHEN** WebSocket 层收到无效 JSON 或 Agent 拒绝请求（如"Agent 忙"）
- **THEN** 服务端 SHALL 推送 `{ type: 'session.error', message: string }`
- **AND** 与 `conversation.error` 的语义区别为：`session.error` 由会话管理层产生，`conversation.error` 由 Agent 执行层产生
