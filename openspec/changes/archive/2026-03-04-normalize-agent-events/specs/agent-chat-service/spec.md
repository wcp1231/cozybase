## ADDED Requirements

### Requirement: ChatSession 必须通过 AgentProvider 驱动 Agent 查询

`ChatSession` SHALL 通过 `AgentProvider` 接口创建和消费 `AgentQuery`，MUST NOT 直接引用 `@anthropic-ai/claude-agent-sdk` 的 `query()`、`Options` 或 `SDKMessage` 等具体类型。`AgentProvider` 实例 SHALL 在 `ChatSession` 构造时由外部注入。

#### Scenario: ChatSession 使用 AgentProvider 发起查询

- **WHEN** 用户发送消息并触发 Agent 查询
- **THEN** ChatSession SHALL 调用 `agentProvider.createQuery(config)` 获取 `AgentQuery`
- **AND** ChatSession SHALL 通过 `for await (const event of agentQuery)` 消费 `AgentEvent` 流
- **AND** ChatSession MUST NOT 直接调用 Claude SDK 的 `query()` 函数

#### Scenario: 切换 provider 时 ChatSession 无需修改

- **WHEN** AgentProvider 实现从 ClaudeCodeProvider 更换为其他 provider（如 CodexProvider）
- **THEN** ChatSession 的代码 SHALL 保持不变
- **AND** 事件消费、持久化和 WebSocket 转发逻辑 SHALL 正常工作

## MODIFIED Requirements

### Requirement: Tool 调用过程必须通过 Chat WebSocket 对前端可见

Agent chat 后端 SHALL 将 Agent 执行工具时产生的 `conversation.tool.*` 事件通过 Chat WebSocket 推送给当前 APP 的浏览器连接，使前端能够区分 running、done 和 error 三种状态。

#### Scenario: 工具开始执行时推送 running 状态

- **WHEN** APP `orders` 的 Agent 开始执行某个工具调用
- **THEN** 服务端 SHALL 立即向 `orders` 的 chat WebSocket 推送 `{ type: 'conversation.tool.started', toolUseId: string, toolName: string }`
- **AND** 前端可据此将该工具显示为 running 状态

#### Scenario: 工具完成后推送摘要与最终状态

- **WHEN** APP `orders` 的 Agent 完成某个工具调用
- **THEN** 服务端 SHALL 向 `orders` 的 chat WebSocket 推送 `{ type: 'conversation.tool.completed', toolUseId: string, toolName: string, summary: string }`
- **AND** 前端可据此将该工具标记为 done 并展示 summary

### Requirement: reconcile_app 完成后必须通知当前 APP 刷新 UI

当某个 APP 的 `reconcile_app` 执行完成时，Agent chat 后端 SHALL 向该 APP 的活跃 chat WebSocket 推送 `session.reconciled` 事件，以便前端刷新最新 UI schema。

#### Scenario: 同 APP 的前端收到 reconcile 完成事件

- **WHEN** APP `orders` 的 `reconcile_app` 成功执行完成
- **AND** `orders` 当前存在活跃的 chat WebSocket 连接
- **THEN** 服务端 SHALL 向该连接推送 `{ type: 'session.reconciled', appSlug: 'orders' }`

#### Scenario: reconcile 事件不会误发到其他 APP

- **WHEN** APP `inventory` 的 `reconcile_app` 执行完成
- **AND** APP `orders` 也存在活跃的 chat WebSocket 连接
- **THEN** 服务端 MUST NOT 向 `orders` 的连接推送 `inventory` 的 `session.reconciled` 事件

#### Scenario: 无活跃 WebSocket 时不影响 reconcile 成功

- **WHEN** APP `orders` 的 `reconcile_app` 执行完成
- **AND** `orders` 当前没有活跃的 chat WebSocket 连接
- **THEN** 服务端 SHALL 将该次 WebSocket 推送视为 no-op
- **AND** `reconcile_app` 本身的成功结果 SHALL 保持不变

### Requirement: 单个 APP 会话必须串行处理用户请求

单个 APP chat session 在任意时刻 SHALL 最多处理一个活跃的 Agent 查询。新的用户消息在已有查询未结束时 MUST NOT 并发执行。

#### Scenario: streaming 期间拒绝新的发送请求

- **WHEN** APP `orders` 的 chat session 正在处理上一条消息
- **AND** 浏览器再次发送新的消息
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 浏览器 SHALL 收到 `{ type: 'session.error', message: 'Agent is busy processing a previous message' }`

#### Scenario: 取消当前查询

- **WHEN** APP `orders` 的 chat session 正在 streaming
- **AND** 浏览器发送取消指令
- **THEN** chat session SHALL 调用 `agentQuery.interrupt()` 中断当前活跃查询
- **AND** 后续状态消息 SHALL 表示该 session 已退出 streaming 状态
