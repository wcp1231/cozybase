# Agent Chat Service

## Purpose

定义 AI Agent 聊天后端在 APP 维度上的会话管理、连接路由与执行语义，确保不同 APP 的上下文隔离，并支持无 WebSocket 的后端主动启动。
## Requirements
### Requirement: Agent chat 后端必须按 APP 管理会话实例

Agent chat 后端 SHALL 提供按 APP 维度管理会话的 manager 抽象。manager SHALL 延迟创建、复用和移除单个 APP 的 chat session，而不是维护一个全局共享 session。不同 APP 的用户消息、assistant 回复、tool 执行状态和 SDK resume 状态 MUST NOT 互相复用。

#### Scenario: 首次连接某个 APP 时创建会话实例

- **WHEN** 第一个浏览器连接到 APP `orders` 的 chat WebSocket
- **THEN** manager SHALL 为 `orders` 创建一个新的 chat session 实例
- **AND** 后续针对 `orders` 的请求 SHALL 复用该实例

#### Scenario: 不同 APP 使用不同会话实例

- **WHEN** 浏览器分别连接 APP `orders` 和 APP `inventory` 的 chat WebSocket
- **THEN** manager SHALL 为两个 APP 提供彼此独立的 chat session 实例
- **AND** 两个实例的流式状态和上下文 SHALL 互不影响

#### Scenario: APP 删除后移除内存会话

- **WHEN** APP `orders` 被删除
- **THEN** manager SHALL 移除 `orders` 对应的内存 chat session
- **AND** 该 session 的活跃查询和 WebSocket 绑定 SHALL 被清理

### Requirement: Chat WebSocket 连接必须显式绑定 APP

Daemon chat WebSocket endpoint SHALL 只接受显式携带 `app` 参数的连接，并 SHALL 将连接路由到对应 APP 的 chat session。

#### Scenario: 带 APP 参数的连接建立成功

- **WHEN** 浏览器连接 `/api/v1/chat/ws?app=orders`
- **THEN** 系统 SHALL 将该连接绑定到 APP `orders` 的 chat session
- **AND** 该连接后续发送的消息 SHALL 只影响 `orders` 的会话

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
- **THEN** 该 session 的所有已持久化消息 SHALL 通过 `session.history` 推送到浏览器
- **AND** 消息内容和顺序 SHALL 与 Agent 实际产生的一致

### Requirement: ChatSession 必须通过 AgentProvider 驱动 Agent 查询

`ChatSession` SHALL 通过 `AgentProvider` 接口创建和消费 `AgentQuery`，MUST NOT 直接引用具体 Agent SDK 的 `query()`、`Options` 或 `SDKMessage` 等类型。`AgentProvider` 实例 SHALL 在 `ChatSession` 构造时由外部注入。

#### Scenario: ChatSession 使用 AgentProvider 发起查询

- **WHEN** 用户发送消息并触发 Agent 查询
- **THEN** ChatSession SHALL 调用 `agentProvider.createQuery(config)` 获取 `AgentQuery`
- **AND** ChatSession SHALL 通过 `for await (const event of agentQuery)` 消费 `AgentEvent` 流
- **AND** ChatSession MUST NOT 直接调用底层 SDK 的 `query()` 函数

#### Scenario: 切换 provider 时 ChatSession 无需修改

- **WHEN** AgentProvider 实现从 ClaudeCodeProvider 更换为其他 provider
- **THEN** ChatSession 的代码 SHALL 保持不变
- **AND** 事件消费、持久化和 WebSocket 转发逻辑 SHALL 正常工作

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

### Requirement: ChatSession 支持无 WebSocket 触发的 injectPrompt

ChatSession SHALL 提供 `injectPrompt(text: string)` 方法，允许后端在无浏览器 WebSocket 连接时主动向 Agent session 注入用户消息并启动 Agent 查询。该方法 SHALL 复用现有的消息处理和持久化逻辑。

#### Scenario: 后端通过 injectPrompt 启动 Agent 工作

- **WHEN** 后端调用 `chatSession.injectPrompt("创建一个健身追踪应用")`
- **AND** 当前没有浏览器 WebSocket 连接到该 session
- **THEN** session SHALL 持久化该用户消息到 SessionStore
- **AND** session SHALL 通过注入的 `AgentProvider` 启动 Agent 查询
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
- **THEN** session SHALL 通过 `session.history` 推送所有已持久化的消息（含 injectPrompt 产生的）
- **AND** 若 Agent 仍在 streaming，后续事件 SHALL 实时推送给浏览器

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

### Requirement: Per-app session 完成委派任务时发布 EventBus 事件

当 Builder 或 Operator session 完成由 CozyBase Agent 委派的任务时，session SHALL 通过 EventBus 发布 `task:completed` 或 `task:failed` 事件。session SHALL 通过 `delegatedTaskId` 属性判断当前查询是否为委派任务。

#### Scenario: Builder session 完成委派任务后发布完成事件

- **WHEN** Builder ChatSession 完成一次由 CozyBase Agent 委派的查询
- **AND** 该 session 的 `delegatedTaskId` 不为 null
- **THEN** session SHALL 在 `afterPrompt()` 中通过 EventBus 发布 `task:completed` 事件
- **AND** 事件 SHALL 包含 `{ taskId, appSlug, summary }`
- **AND** `summary` SHALL 取自 Agent 最后一条 assistant message
- **AND** 发布完成后 `delegatedTaskId` SHALL 重置为 null

#### Scenario: Operator session 完成委派任务后发布完成事件

- **WHEN** Operator OperatorSession 完成一次由 CozyBase Agent 委派的查询
- **AND** 该 session 的 `delegatedTaskId` 不为 null
- **THEN** session SHALL 在 `afterPrompt()` 中通过 EventBus 发布 `task:completed` 事件
- **AND** 行为与 Builder session 一致

#### Scenario: 非委派查询不发布事件

- **WHEN** Builder 或 Operator session 完成一次由用户直接发起的查询
- **AND** `delegatedTaskId` 为 null
- **THEN** session MUST NOT 发布 `task:completed` 或 `task:failed` 事件

#### Scenario: 委派查询失败时发布失败事件

- **WHEN** Builder 或 Operator session 在执行委派查询时遇到错误
- **AND** `delegatedTaskId` 不为 null
- **THEN** session SHALL 通过 EventBus 发布 `task:failed` 事件
- **AND** 事件 SHALL 包含 `{ taskId, appSlug, error }`

### Requirement: Session 支持 delegatedTaskId 注入

Builder ChatSession 和 Operator OperatorSession SHALL 支持外部注入 `delegatedTaskId` 属性。当 CozyBase Agent 的委派工具通过 TaskRegistry 触发 `injectPrompt()` 时，SHALL 同时设置目标 session 的 `delegatedTaskId`。

#### Scenario: injectPrompt 同时设置 delegatedTaskId

- **WHEN** TaskRegistry 调度一个委派任务到 Builder session
- **AND** 调用 `session.injectPrompt(instruction)` 前设置 `session.delegatedTaskId = taskId`
- **THEN** session 在该次查询期间 SHALL 持有该 taskId
- **AND** 查询完成后的 `afterPrompt()` SHALL 能读取到该 taskId
