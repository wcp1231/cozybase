# App Error Logs

## Purpose

定义 APP 运行时错误的统一采集、去重限流与保留策略，为 Console 与诊断接口提供稳定的数据来源。

## Requirements

### Requirement: 统一采集 APP 运行时错误
系统 SHALL 在 `app_error_logs` 中持久化 APP 运行时产生的 ERROR 级别错误。每条记录 MUST 至少包含 `app_slug`、`runtime_mode`、`source_type`、`source_detail`、`error_code`、`error_message`、`stack_trace`、`occurrence_count`、`created_at`、`updated_at`。`source_type` MUST 支持 `http_function`、`schedule`、`build`。

#### Scenario: 记录 HTTP 函数 500 错误
- **WHEN** Stable 或 Draft 模式下的 HTTP 函数执行返回 `500 Internal Server Error`
- **THEN** 系统 SHALL 新建或更新一条 `app_error_logs` 记录
- **AND** 该记录 SHALL 标记 `source_type = http_function`，并保存错误消息与可用的 stack trace

#### Scenario: 记录 Schedule 执行错误
- **WHEN** Schedule 执行以 `error` 或 `timeout` 结束
- **THEN** 系统 SHALL 新建或更新一条 `source_type = schedule` 的 `app_error_logs` 记录
- **AND** 该记录 SHALL 标识失败的 schedule 来源

#### Scenario: 记录构建错误
- **WHEN** APP 构建或加载过程中产生 ERROR 级别失败
- **THEN** 系统 SHALL 新建或更新一条 `source_type = build` 的 `app_error_logs` 记录
- **AND** 该记录 SHALL 包含构建失败消息与可用的 stack trace

### Requirement: 错误写入限流与去重
系统 SHALL 对每个 `app_slug + runtime_mode` 的新建错误记录执行每分钟最多 30 条的限流。系统 SHALL 在最近 60 秒内将相同 `app_slug + runtime_mode + source_type + source_detail + error_message` 的错误合并到同一条记录，并递增 `occurrence_count`、刷新 `updated_at`，而不是重复插入新行。

#### Scenario: 相同错误在 60 秒内重复出现
- **WHEN** 同一 APP 同一模式下同一错误在 60 秒内重复发生两次
- **THEN** 系统 SHALL 只保留一条错误记录
- **AND** `occurrence_count` SHALL 累加为 `2`

#### Scenario: 超过每分钟写入上限
- **WHEN** 某 APP 某模式在同一分钟内已经新建 30 条错误记录后又出现新的不同错误
- **THEN** 系统 MUST NOT 再为该分钟创建新的 `app_error_logs` 行

### Requirement: 错误保留与 Draft 清理
系统 SHALL 仅保留每个 `app_slug + runtime_mode` 最近 200 条错误记录，并在超出时删除最旧记录。系统 SHALL 在 APP publish 成功后删除该 APP 的全部 Draft 错误日志，而不影响 Stable 错误日志。

#### Scenario: 超过 200 条时淘汰最旧记录
- **WHEN** 某 APP 的 Stable 错误日志插入第 201 条记录
- **THEN** 系统 SHALL 删除该 APP Stable 模式下最旧的一条错误记录
- **AND** 系统 SHALL 仅保留最近 200 条错误记录

#### Scenario: Publish 成功后清空 Draft 错误日志
- **WHEN** 某 APP 成功 publish 新的 Stable 版本
- **THEN** 系统 SHALL 删除该 APP `runtime_mode = draft` 的全部 `app_error_logs`
- **AND** 系统 SHALL 保留该 APP 的 Stable 错误日志
