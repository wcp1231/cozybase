## ADDED Requirements

### Requirement: HTTP 函数 500 错误写入统一错误日志
系统 SHALL 在 HTTP 触发的函数执行产生 `500 Internal Server Error` 时写入 `app_error_logs`。错误记录 MUST 包含运行模式、`source_type = http_function`、可标识函数入口的 `source_detail`、错误消息和可用的 stack trace。错误日志写入 SHALL 不改变原始 HTTP 响应语义。

#### Scenario: Handler 抛出普通 Error
- **WHEN** `POST /stable/apps/my-app/fn/create-order` 的 handler 抛出普通 `Error`
- **THEN** 系统 SHALL 返回 HTTP 500
- **AND** 系统 SHALL 新建或更新一条 `source_type = http_function`、`runtime_mode = stable` 的 `app_error_logs` 记录

#### Scenario: 函数加载失败时记录诊断信息
- **WHEN** Draft 模式函数文件在加载阶段发生语法错误或 `import()` 失败
- **THEN** 系统 SHALL 返回 HTTP 500
- **AND** 系统 SHALL 写入一条包含加载错误消息与 stack trace 的 `app_error_logs` 记录

#### Scenario: 业务型 AppError 不自动写入统一错误日志
- **WHEN** handler 抛出带有显式 `statusCode = 400` 的 `AppError`
- **THEN** 系统 SHALL 返回 HTTP 400
- **AND** 系统 MUST NOT 仅因该异常自动写入 `app_error_logs`

#### Scenario: 错误日志写入失败不改变 500 响应
- **WHEN** handler 抛出普通 `Error` 且错误日志写入过程失败
- **THEN** 系统 SHALL 仍返回原始 HTTP 500 响应
- **AND** 系统 SHALL 不因日志写入失败再覆盖为其他状态码
