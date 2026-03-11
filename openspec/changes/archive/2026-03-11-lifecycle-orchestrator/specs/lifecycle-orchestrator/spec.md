## ADDED Requirements

### Requirement: LifecycleStore SHALL 管理 session 级 active lifecycle

系统 SHALL 为每个 CozyBase session 维护一个 `LifecycleStore`。`LifecycleStore` SHALL 跟踪当前 active lifecycle、其 inbox、pending tasks、已完成 tasks、active conversation 和等待 lifecycle 结束的 waiters。v1 中每个 session MUST NOT 同时存在多个 active lifecycle。

#### Scenario: 首个用户输入创建 lifecycle

- **WHEN** CozyBase session 当前没有 active lifecycle
- **AND** 收到新的用户输入事件
- **THEN** 系统 SHALL 创建一个新的 lifecycle
- **AND** SHALL 将该用户输入写入该 lifecycle 的 inbox
- **AND** SHALL 将该 lifecycle 标记为 active

#### Scenario: active lifecycle 存在时追加输入

- **WHEN** CozyBase session 已有 active lifecycle
- **AND** 收到新的用户输入事件
- **THEN** 系统 MUST NOT 创建新的 lifecycle
- **AND** SHALL 将该输入追加到现有 lifecycle 的 inbox

#### Scenario: task 与 lifecycle 归属可查询

- **WHEN** 某个 lifecycle 派生出新的 task
- **THEN** 系统 SHALL 记录该 task 与 lifecycle 的归属关系
- **AND** 后续收到 task 状态变更时 SHALL 能定位其所属 lifecycle

### Requirement: Lifecycle inbox SHALL 串行驱动 conversation

同一个 lifecycle 内任意时刻 SHALL 最多只有一个 active conversation。用户输入、task 结果和系统事件 SHALL 先进入 lifecycle inbox，再由 orchestrator 按顺序推进 conversation。

#### Scenario: idle lifecycle 启动新的 conversation

- **WHEN** lifecycle 没有 active conversation
- **AND** inbox 中存在待处理事件
- **THEN** orchestrator SHALL 取出事件并启动新的 conversation

#### Scenario: conversation 运行时新事件进入队列

- **WHEN** lifecycle 内已有 active conversation
- **AND** 收到新的用户输入、task 结果或系统事件
- **THEN** 系统 SHALL 将该事件写入 inbox
- **AND** MUST NOT 抢占当前 active conversation

#### Scenario: 当前 conversation 结束后继续处理 inbox

- **WHEN** lifecycle 的当前 conversation 结束
- **AND** inbox 仍有待处理事件
- **THEN** orchestrator SHALL 启动下一段 conversation

### Requirement: lifecycle 完成条件 SHALL 独立于单次 conversation 完成

lifecycle 的结束 MUST NOT 由单次 `conversation.run.completed` 决定。系统 SHALL 仅在 lifecycle 没有 active conversation、inbox 为空且 pending tasks 为空时结束该 lifecycle。

#### Scenario: conversation 完成但 pending tasks 未清空

- **WHEN** 某段 conversation 结束
- **AND** 当前 lifecycle 仍有 pending tasks
- **THEN** 系统 SHALL 保持该 lifecycle 为 active
- **AND** MUST NOT 结束该 lifecycle

#### Scenario: 所有任务完成且 inbox 为空时结束 lifecycle

- **WHEN** lifecycle 没有 active conversation
- **AND** inbox 为空
- **AND** pending tasks 为空
- **THEN** 系统 SHALL 发出 `lifecycle.completed`
- **AND** SHALL 将该 lifecycle 标记为 completed

#### Scenario: lifecycle 失败时统一结束

- **WHEN** orchestrator 判定 lifecycle 进入不可恢复的失败状态
- **THEN** 系统 SHALL 发出 `lifecycle.failed`
- **AND** SHALL 结束该 lifecycle

### Requirement: Lifecycle orchestrator SHALL 通过 EventBus 与 TaskRegistry 双通道感知 task 状态

orchestrator SHALL 优先通过 EventBus 接收 task 生命周期事件，并 SHALL 在 active lifecycle 存在且有 pending tasks 时定期查询 `TaskRegistry` 作为兜底。

#### Scenario: EventBus 推进 lifecycle

- **WHEN** EventBus 发布某个 pending task 的完成或失败事件
- **THEN** orchestrator SHALL 将该结果写入所属 lifecycle 的 inbox
- **AND** SHALL 更新该 lifecycle 的 pending tasks 状态

#### Scenario: EventBus 缺失时轮询兜底

- **WHEN** 某个 pending task 的 EventBus 事件未被收到
- **AND** `TaskRegistry.getTask(taskId)` 返回终态
- **THEN** orchestrator SHALL 以该查询结果更新 lifecycle
- **AND** SHALL 继续推进后续 conversation 或 lifecycle 完成判定
