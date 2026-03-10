## ADDED Requirements

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

- **WHEN** Builder 或 Operator session 完成一次由用户直接发起的查询（非 CozyBase Agent 委派）
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
