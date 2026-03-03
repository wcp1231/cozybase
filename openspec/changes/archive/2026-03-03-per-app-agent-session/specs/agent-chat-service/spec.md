# Agent Chat Service

## ADDED Requirements

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
