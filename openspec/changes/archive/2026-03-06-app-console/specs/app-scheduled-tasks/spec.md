## ADDED Requirements

### Requirement: Schedule 执行错误同步到统一错误日志
系统 SHALL 在 schedule 执行以 `error` 或 `timeout` 结束时，在更新 `schedule_runs` 的同时写入 `app_error_logs`。错误记录 MUST 使用 `source_type = schedule`，并包含 schedule 标识、运行模式、错误消息和可用的 stack trace。执行成功或 `skipped` 的 schedule MUST NOT 自动写入 `app_error_logs`。

#### Scenario: 自动触发的 Schedule 执行失败
- **WHEN** Stable 模式下某个 schedule 被 cron 自动触发并以 `error` 结束
- **THEN** 系统 SHALL 更新对应的 `schedule_runs` 记录为失败
- **AND** 系统 SHALL 新建或更新一条 `source_type = schedule` 的 `app_error_logs` 记录

#### Scenario: 手动触发的 Schedule 超时
- **WHEN** 用户手动触发 Draft 模式 schedule 且执行以 `timeout` 结束
- **THEN** 系统 SHALL 在 `schedule_runs` 中记录超时结果
- **AND** 系统 SHALL 写入一条包含超时错误消息的 `app_error_logs` 记录

#### Scenario: 成功执行不产生错误日志
- **WHEN** 某个 schedule 成功执行完成
- **THEN** 系统 SHALL 更新 `schedule_runs` 为 `success`
- **AND** 系统 MUST NOT 自动写入新的 `app_error_logs` 记录

### Requirement: APP Schedule 状态可查询
系统 SHALL 为每个 APP 提供可查询的 schedule 状态视图。每个 schedule 条目 MUST 包含声明式配置（`name`、`cron`、`enabled`、`function`、`concurrency`、`timeout`）、最近一次运行结果，以及当 Stable cron job 已加载时的下次执行时间。对于 Draft 模式或未加载的 APP，下次执行时间 SHALL 为空。

#### Scenario: 查询 Running Stable APP 的 Schedule 状态
- **WHEN** 系统查询一个 Stable 状态为 `running` 的 APP 的 schedule 列表
- **THEN** 每个已加载的 schedule 条目 SHALL 返回配置、最近一次运行结果和下次执行时间

#### Scenario: 查询 Draft APP 的 Schedule 状态
- **WHEN** 系统查询 Draft 模式 APP 的 schedule 列表
- **THEN** 系统 SHALL 返回 Draft 的 schedule 配置与最近一次运行结果
- **AND** 每个条目的下次执行时间 SHALL 为空

#### Scenario: 查询某个 Schedule 的运行历史
- **WHEN** 系统按 APP 和 schedule 名称查询运行历史并指定 `limit = 20`
- **THEN** 系统 SHALL 按最近开始时间倒序返回最多 20 条 `schedule_runs` 记录
