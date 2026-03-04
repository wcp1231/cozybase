# Agent Chat Service

## Purpose

定义 AI Agent 聊天后端的会话管理方式，确保会话按 APP 隔离，并以可控的串行语义处理浏览器请求。
## Requirements
### Requirement: Agent chat 后端必须按 APP 管理会话实例

Agent chat 后端 SHALL 提供按 APP 维度管理会话的 manager 抽象。manager SHALL 延迟创建、复用和移除单个 APP 的 chat session，而不是维护一个全局共享 session。

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

### Requirement: 单个 APP 会话必须串行处理用户请求

单个 APP chat session 在任意时刻 SHALL 最多处理一个活跃的 Agent 查询。新的用户消息在已有查询未结束时 MUST NOT 并发执行。

#### Scenario: streaming 期间拒绝新的发送请求

- **WHEN** APP `orders` 的 chat session 正在处理上一条 `chat:send` 消息
- **AND** 浏览器再次发送新的 `chat:send`
- **THEN** 系统 SHALL 拒绝该请求
- **AND** 浏览器 SHALL 收到表示 Agent 正忙的错误消息

#### Scenario: 取消当前查询

- **WHEN** APP `orders` 的 chat session 正在 streaming
- **AND** 浏览器发送 `chat:cancel`
- **THEN** chat session SHALL 中断当前活跃查询
- **AND** 后续状态消息 SHALL 表示该 session 已退出 streaming 状态

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

### Requirement: Tool 调用过程必须通过 Chat WebSocket 对前端可见

Agent chat 后端 SHALL 将 Agent 执行工具时产生的进度消息与结果摘要消息通过 Chat WebSocket 推送给当前 APP 的浏览器连接，使前端能够区分 running、done 和 error 三种状态。

#### Scenario: 工具开始执行时推送 running 状态

- **WHEN** APP `orders` 的 Agent 开始执行某个工具调用
- **THEN** 服务端 SHALL 立即向 `orders` 的 chat WebSocket 推送一条可表示工具运行中的消息
- **AND** 该消息 SHALL 包含工具名称或可识别的工具标识

#### Scenario: 工具完成后推送摘要与最终状态

- **WHEN** APP `orders` 的 Agent 完成某个工具调用
- **THEN** 服务端 SHALL 向 `orders` 的 chat WebSocket 推送一条工具摘要消息
- **AND** 该消息 SHALL 标明该工具调用的最终状态为 done 或 error
- **AND** 该消息 SHALL 包含供前端展示的摘要文本或错误信息

### Requirement: reconcile_app 完成后必须通知当前 APP 刷新 UI

当某个 APP 的 `reconcile_app` 执行完成时，Agent chat 后端 SHALL 向该 APP 的活跃 chat WebSocket 推送 `app:reconciled` 事件，以便前端刷新最新 UI schema。

#### Scenario: 同 APP 的前端收到 reconcile 完成事件

- **WHEN** APP `orders` 的 `reconcile_app` 成功执行完成
- **AND** `orders` 当前存在活跃的 chat WebSocket 连接
- **THEN** 服务端 SHALL 向该连接推送 `type = "app:reconciled"` 的消息
- **AND** 消息 SHALL 包含 `orders` 的 APP 标识

#### Scenario: reconcile 事件不会误发到其他 APP

- **WHEN** APP `inventory` 的 `reconcile_app` 执行完成
- **AND** APP `orders` 也存在活跃的 chat WebSocket 连接
- **THEN** 服务端 MUST NOT 向 `orders` 的连接推送 `inventory` 的 `app:reconciled` 事件

#### Scenario: 无活跃 WebSocket 时不影响 reconcile 成功

- **WHEN** APP `orders` 的 `reconcile_app` 执行完成
- **AND** `orders` 当前没有活跃的 chat WebSocket 连接
- **THEN** 服务端 SHALL 将该次 WebSocket 推送视为 no-op
- **AND** `reconcile_app` 本身的成功结果 SHALL 保持不变

