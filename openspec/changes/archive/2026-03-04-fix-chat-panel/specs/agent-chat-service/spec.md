# Agent Chat Service

## ADDED Requirements

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
