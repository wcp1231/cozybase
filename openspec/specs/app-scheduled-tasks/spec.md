# App Scheduled Tasks

## Purpose

定义 APP 在 `app.yaml` 中声明和执行定时任务的运行模型，包括生命周期、并发策略、执行历史、手动触发与错误集成。
## Requirements
### Requirement: APP 定时任务声明式配置
系统 SHALL 支持在 `app.yaml` 中通过 `schedules` 数组声明定时任务。每个 schedule MUST 包含 `name`、`cron`、`function` 字段，并可选配置 `enabled`、`concurrency`、`timezone`、`timeout`。系统 SHALL 使用 schema 校验配置；不合法的条目 MUST 被跳过且记录告警日志。

#### Scenario: 加载合法 schedules 配置
- **WHEN** APP 的 `app.yaml` 包含合法的 `schedules` 配置
- **THEN** 系统 SHALL 成功解析每个 schedule 并为其准备可执行定义

#### Scenario: 跳过非法 schedule 配置
- **WHEN** 某个 schedule 缺失必填字段或 `cron` 表达式非法
- **THEN** 系统 MUST 跳过该 schedule 且记录结构化告警日志

### Requirement: ScheduleManager 生命周期管理
系统 SHALL 提供 `ScheduleManager` 管理 cron job 生命周期，包括 `loadApp`、`unloadApp`、`reloadApp`、`shutdown`。ScheduleManager SHALL 与 APP 的 Stable 生命周期联动，仅在需要时加载对应 APP 的 schedules。

#### Scenario: Daemon 启动时加载 running APP 的 schedules
- **WHEN** Daemon 启动并发现某 APP 的 `stable_status` 为 `running`
- **THEN** 系统 SHALL 调用 `ScheduleManager.loadApp(appSlug)` 加载该 APP 的 schedules

#### Scenario: APP 停止时卸载 schedules
- **WHEN** 某 APP 触发 Stable 停止流程
- **THEN** 系统 SHALL 调用 `ScheduleManager.unloadApp(appSlug)` 停止该 APP 的所有 cron jobs

### Requirement: Schedule handler 引用 Function 导出
系统 SHALL 通过 `function: file:exportName` 解析 schedule handler。`file:exportName` SHALL 映射到 `functions/{file}.ts` 的命名导出；当未提供冒号时（如 `cleanup`）系统 SHALL 使用 default 导出。

#### Scenario: 使用命名导出作为 schedule handler
- **WHEN** schedule 配置为 `function: "scrape:fetchAll"`
- **THEN** 系统 SHALL 调用 `functions/scrape.ts` 的 `fetchAll` 导出

#### Scenario: 使用 default 导出作为 schedule handler
- **WHEN** schedule 配置为 `function: "cleanup"`
- **THEN** 系统 SHALL 调用 `functions/cleanup.ts` 的 default 导出

### Requirement: Schedule 执行上下文
系统 SHALL 复用现有函数执行基础设施执行 schedule handler。cron 触发时，`FunctionContext.req` MUST 为 `undefined`，并通过上下文标识当前触发来源为 schedule 执行。

#### Scenario: cron 触发时构建无请求上下文
- **WHEN** schedule 被 cron 自动触发执行
- **THEN** 系统 SHALL 传入 `req = undefined` 的 `FunctionContext` 执行 handler

### Requirement: 并发策略控制
系统 SHALL 支持 `skip`、`queue`、`parallel` 三种并发策略。`skip` 为默认策略；`queue` 的排队深度 MUST 最多为 1；`parallel` SHALL 允许同一 schedule 并发执行多个实例。

#### Scenario: skip 策略跳过重入执行
- **WHEN** 同一 schedule 上一次执行尚未结束且并发策略为 `skip`
- **THEN** 系统 SHALL 跳过本次触发并写入一条 `skipped` 运行记录

#### Scenario: queue 策略仅保留一个待执行任务
- **WHEN** 同一 schedule 正在运行且并发策略为 `queue`
- **THEN** 系统 SHALL 最多保留 1 个待执行任务，超出触发 MUST 被跳过

#### Scenario: parallel 策略允许并发
- **WHEN** 同一 schedule 连续触发且并发策略为 `parallel`
- **THEN** 系统 SHALL 并发执行多个 schedule 任务实例

### Requirement: 执行历史记录与保留策略
系统 SHALL 在 `platform.sqlite` 的 `schedule_runs` 表记录 schedule 执行历史，状态至少包含 `running`、`success`、`error`、`timeout`、`skipped`。系统 SHALL 在每次执行完成后保留每个 `app+schedule` 最近 100 条记录。

#### Scenario: 记录执行结果
- **WHEN** schedule 执行完成（成功、失败或超时）
- **THEN** 系统 SHALL 更新对应 `schedule_runs` 记录状态并保存开始/结束时间与错误信息（如有）

#### Scenario: 自动清理历史记录
- **WHEN** 某 `app+schedule` 组合的运行记录超过 100 条
- **THEN** 系统 SHALL 删除最旧记录，仅保留最近 100 条

### Requirement: 手动触发 API
系统 SHALL 提供手动触发端点 `POST /draft/apps/:appSlug/schedule/:scheduleName/trigger`，并支持 Stable 对应端点 `POST /stable/apps/:appSlug/schedule/:scheduleName/trigger`。手动触发 SHALL 同步等待执行完成并返回结果，同时写入 `schedule_runs`。

#### Scenario: Draft 手动触发成功
- **WHEN** 调用 `POST /draft/apps/my-app/schedule/daily-scrape/trigger` 且 schedule 存在
- **THEN** 系统 SHALL 在 Draft 模式执行 handler，返回执行结果并记录一次运行历史

#### Scenario: 手动触发不存在的 schedule
- **WHEN** 调用手动触发 API 但 `scheduleName` 不存在
- **THEN** 系统 SHALL 返回 `404 Not Found`

### Requirement: 自动触发仅在 Stable 环境生效
系统 MUST 仅在 Stable 环境自动注册并执行 cron 任务。Draft 环境 MUST NOT 自动运行 cron，仅允许通过手动触发 API 执行。

#### Scenario: Stable 环境自动执行
- **WHEN** APP Stable 版本处于 `running` 状态且 schedule 已启用
- **THEN** 系统 SHALL 按 cron 表达式自动触发执行

#### Scenario: Draft 环境不自动执行
- **WHEN** APP 仅有 Draft 环境运行
- **THEN** 系统 MUST NOT 自动执行任何 cron 任务

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
