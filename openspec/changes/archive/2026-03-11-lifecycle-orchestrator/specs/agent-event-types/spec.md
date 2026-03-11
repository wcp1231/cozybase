## ADDED Requirements

### Requirement: LifecycleEvent 必须覆盖 orchestrator 生命周期语义

系统 SHALL 定义 `LifecycleEvent` 类型，用于表达 session-scoped orchestrator 的生命周期状态。所有 lifecycle 事件 SHALL 以 `lifecycle.` 作为命名前缀，并定义在 `packages/ai-runtime/src/types.ts` 中供 daemon 与 ACP bridge 共享。

#### Scenario: lifecycle.started 表示新的生命周期开始

- **WHEN** orchestrator 为某个 CozyBase session 创建新的 lifecycle
- **THEN** 系统 SHALL emit `{ type: 'lifecycle.started', lifecycleId: string }`

#### Scenario: lifecycle.completed 表示生命周期正常完成

- **WHEN** 某个 lifecycle 没有 active conversation、inbox 为空且 pending tasks 为空
- **THEN** 系统 SHALL emit `{ type: 'lifecycle.completed', lifecycleId: string }`

#### Scenario: lifecycle.failed 表示生命周期失败结束

- **WHEN** orchestrator 判定某个 lifecycle 无法继续推进
- **THEN** 系统 SHALL emit `{ type: 'lifecycle.failed', lifecycleId: string, message: string }`

### Requirement: EventBus 支持 task:started 事件类型

EventBus SHALL 支持 `task:started` 事件类型，用于在委派 task 真正开始执行时通知 orchestrator。事件 payload SHALL 包含 `{ taskId: string, appSlug: string }`。

#### Scenario: task:started 事件传递开始执行事实

- **WHEN** 某个委派 task 从 `queued` 切换为 `running`
- **THEN** 系统 SHALL 发布 `task:started`
- **AND** 事件 payload SHALL 包含 `taskId` 和 `appSlug`

## MODIFIED Requirements

### Requirement: EventBus 支持 task:completed 事件类型

EventBus SHALL 支持 `task:completed` 事件类型，用于 Builder/Operator session 在完成 CozyBase Agent 委派的异步任务时通知 lifecycle orchestrator。事件 payload SHALL 包含 `{ taskId: string, appSlug: string, summary: string }`，并 SHALL 可被用于更新 lifecycle 中对应 task 的终态。

#### Scenario: task:completed 事件传递完整的任务结果

- **WHEN** Builder session 完成委派任务并发布 `task:completed` 事件
- **THEN** 事件 payload SHALL 包含 `taskId`、`appSlug` 和 `summary`
- **AND** lifecycle orchestrator 作为订阅者 SHALL 能接收到该事件

#### Scenario: 多个订阅者均可接收 task:completed 事件

- **WHEN** `task:completed` 事件被发布
- **AND** 存在多个订阅者
- **THEN** 所有订阅者 SHALL 均接收到该事件

### Requirement: EventBus 支持 task:failed 事件类型

EventBus SHALL 支持 `task:failed` 事件类型，用于 Builder/Operator session 在执行 CozyBase Agent 委派的异步任务失败时通知 lifecycle orchestrator。事件 payload SHALL 包含 `{ taskId: string, appSlug: string, error: string }`，并 SHALL 可被用于结束或继续推进所属 lifecycle。

#### Scenario: task:failed 事件传递失败原因

- **WHEN** Operator session 执行委派任务遇到错误并发布 `task:failed` 事件
- **THEN** 事件 payload SHALL 包含 `taskId`、`appSlug` 和 `error`
- **AND** lifecycle orchestrator 作为订阅者 SHALL 能接收到该事件

#### Scenario: TaskRegistry 收到 task:failed 后更新任务状态

- **WHEN** TaskRegistry 收到 `task:failed` 事件
- **THEN** SHALL 将对应 taskId 的任务状态从 `running` 更新为 `failed`
- **AND** SHALL 检查同一队列是否有下一个 queued 任务并自动推进
