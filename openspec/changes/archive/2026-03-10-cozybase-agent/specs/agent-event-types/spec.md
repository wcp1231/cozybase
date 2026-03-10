## ADDED Requirements

### Requirement: EventBus 支持 task:completed 事件类型

EventBus SHALL 支持 `task:completed` 事件类型，用于 Builder/Operator session 在完成 CozyBase Agent 委派的异步任务时通知 CozyBaseSession。事件 payload SHALL 包含 `{ taskId: string, appSlug: string, summary: string }`。

#### Scenario: task:completed 事件传递完整的任务结果

- **WHEN** Builder session 完成委派任务并发布 `task:completed` 事件
- **THEN** 事件 payload SHALL 包含 `taskId`（任务唯一标识）、`appSlug`（目标 APP）和 `summary`（结果摘要）
- **AND** CozyBaseSession 作为订阅者 SHALL 能接收到该事件

#### Scenario: 多个订阅者均可接收 task:completed 事件

- **WHEN** `task:completed` 事件被发布
- **AND** 存在多个订阅者（如 CozyBaseSession 和 TaskRegistry）
- **THEN** 所有订阅者 SHALL 均接收到该事件

### Requirement: EventBus 支持 task:failed 事件类型

EventBus SHALL 支持 `task:failed` 事件类型，用于 Builder/Operator session 在执行 CozyBase Agent 委派的异步任务失败时通知 CozyBaseSession。事件 payload SHALL 包含 `{ taskId: string, appSlug: string, error: string }`。

#### Scenario: task:failed 事件传递失败原因

- **WHEN** Operator session 执行委派任务遇到错误并发布 `task:failed` 事件
- **THEN** 事件 payload SHALL 包含 `taskId`（任务唯一标识）、`appSlug`（目标 APP）和 `error`（错误描述）
- **AND** CozyBaseSession 作为订阅者 SHALL 能接收到该事件

#### Scenario: TaskRegistry 收到 task:failed 后更新任务状态

- **WHEN** TaskRegistry 收到 `task:failed` 事件
- **THEN** SHALL 将对应 taskId 的任务状态从 `running` 更新为 `failed`
- **AND** SHALL 检查同一队列是否有下一个 queued 任务并自动推进
