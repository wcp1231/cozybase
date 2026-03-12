# App Console

## Purpose

定义 APP Console 的诊断视图与接口，包括运行状态、错误摘要、schedule 状态，以及对应的 MCP 与 Web 页面入口。

## Requirements

### Requirement: Console 诊断概要 API
系统 SHALL 提供 `GET /api/v1/apps/:slug/console` 端点。该端点 MUST 支持 `mode=stable|draft` 查询参数，默认值为 `stable`。响应 MUST 包含 `app_status`、`error_summary`、`schedules_summary`。

- `app_status` MUST 至少包含 `stable_running`、`current_version`、`published_version`
- `error_summary` MUST 提供最近 24 小时错误总数、按 `source_type` 聚合的计数，以及最新一条错误的摘要（不含完整 stack trace）
- `schedules_summary` MUST 提供 schedule 总数、healthy 数、failing 数和 failing 名称列表

#### Scenario: 获取 Stable 模式 Console 概要
- **WHEN** 请求 `GET /api/v1/apps/my-app/console?mode=stable`
- **THEN** 系统 SHALL 返回 `my-app` Stable 模式的 `app_status`、最近 24 小时 `error_summary` 和 `schedules_summary`

#### Scenario: 获取 Draft 模式 Console 概要
- **WHEN** 请求 `GET /api/v1/apps/my-app/console?mode=draft`
- **THEN** 系统 SHALL 返回 Draft 模式的同结构概要数据
- **AND** 系统 SHALL 仅统计该 APP Draft 模式的数据

### Requirement: Console 错误详情 API
系统 SHALL 提供 `GET /api/v1/apps/:slug/errors` 端点。该端点 MUST 支持 `mode`、`limit`、`offset`、`source_type` 查询参数，并按 `updated_at` 倒序返回错误详情。每条错误项 MUST 包含 `source_type`、`source_detail`、`error_code`、`error_message`、`stack_trace`、`occurrence_count`、`created_at`、`updated_at`。

#### Scenario: 按错误来源过滤
- **WHEN** 请求 `GET /api/v1/apps/my-app/errors?mode=stable&source_type=http_function&limit=10`
- **THEN** 系统 SHALL 仅返回 `source_type = http_function` 的错误
- **AND** 结果 SHALL 按最近更新时间倒序排列

#### Scenario: 读取第二页错误列表
- **WHEN** 请求 `GET /api/v1/apps/my-app/errors?mode=stable&limit=20&offset=20`
- **THEN** 系统 SHALL 跳过前 20 条结果并返回后续最多 20 条错误

### Requirement: Console Schedule API
系统 SHALL 提供 `GET /api/v1/apps/:slug/schedules` 和 `GET /api/v1/apps/:slug/schedules/:name/runs` 两个端点。两个端点 MUST 支持 `mode=stable|draft` 查询参数，`runs` 端点还 MUST 支持 `limit`。`/schedules` MUST 返回 schedule 配置、最近一次运行摘要和当前可用的下次执行时间；`/runs` MUST 按最近开始时间倒序返回指定 schedule 的运行历史。查询不存在的 schedule 运行历史时，系统 SHALL 返回 `404 Not Found`。

#### Scenario: Stable 模式列出 Schedule
- **WHEN** 请求 `GET /api/v1/apps/my-app/schedules?mode=stable`
- **THEN** 系统 SHALL 返回 Stable 模式下每个 schedule 的配置、最新运行状态和下次执行时间

#### Scenario: Draft 模式列出 Schedule
- **WHEN** 请求 `GET /api/v1/apps/my-app/schedules?mode=draft`
- **THEN** 系统 SHALL 返回 Draft 模式下的 schedule 配置与最新运行状态
- **AND** 系统 SHALL 不返回自动调度的下次执行时间

#### Scenario: 读取某个 Schedule 的运行历史
- **WHEN** 请求 `GET /api/v1/apps/my-app/schedules/daily-sync/runs?mode=stable&limit=20`
- **THEN** 系统 SHALL 返回 `daily-sync` 最近 20 条运行记录

### Requirement: MCP 工具暴露 Console 诊断数据
系统 SHALL 提供 `get_app_console` 和 `get_app_errors` 两个 MCP 工具。两个工具 MUST 接受 `app_name` 和可选 `mode` 参数；`get_app_errors` 还 MUST 接受 `limit` 和 `source_type`。工具返回数据 SHALL 与 Console HTTP API 的同模式数据保持一致。

#### Scenario: Agent 获取概要诊断数据
- **WHEN** Agent 调用 `get_app_console`，参数为 `app_name = "my-app"`、`mode = "stable"`
- **THEN** 系统 SHALL 返回与 `GET /api/v1/apps/my-app/console?mode=stable` 一致的概要信息

#### Scenario: Agent 按来源读取错误详情
- **WHEN** Agent 调用 `get_app_errors`，参数为 `app_name = "my-app"`、`mode = "stable"`、`source_type = "schedule"`、`limit = 5`
- **THEN** 系统 SHALL 返回最多 5 条 schedule 来源的错误详情

### Requirement: Web Console 页面
系统 SHALL 在 `/:mode/apps/:appName/console` 提供 APP Console 页面，并在 APP Sidebar 中提供导航入口。页面 SHALL 包含 `Errors`、`Schedules`、`Database` 三个标签页。`Errors` 标签页 SHALL 默认展示错误列表并支持展开 stack trace；`Schedules` 标签页 SHALL 展示 schedule 列表与运行历史；`Database` 标签页 SHALL 复用现有 `_db/schemas`、`_db/tables`、`_db/sql` 接口，而不是新增数据库 API。

#### Scenario: 进入 Console 默认展示 Errors
- **WHEN** 用户访问 `/stable/apps/my-app/console`
- **THEN** 页面 SHALL 打开 APP Console
- **AND** 默认选中 `Errors` 标签页并显示最近错误列表

#### Scenario: Draft 模式浏览 Console
- **WHEN** 用户访问 `/draft/apps/my-app/console`
- **THEN** 页面 SHALL 正常渲染 `Errors`、`Schedules`、`Database` 三个标签页
- **AND** `Schedules` 标签页 SHALL 不展示自动调度的下次执行时间

### Requirement: Console 承载 APP 生命周期与删除操作
系统 SHALL 将 Stable APP 的启动、停止和删除操作放在 Stable Console 页面头部，而不是放在普通 Stable APP 页面头部。Stable APP 普通页面右上角 SHALL 显示“控制台”按钮，引导用户进入 Console。Draft Console 页面头部 SHALL 提供删除当前 APP 的入口。

#### Scenario: Stable 普通页面从头部进入 Console
- **WHEN** 用户访问 `/stable/apps/my-app/...`
- **THEN** 页面头部右上角 SHALL 显示“控制台”按钮
- **AND** 页面头部 SHALL 不再直接显示 Stable 的启动或停止按钮

#### Scenario: Stable Console 根据运行状态显示动作
- **WHEN** 用户访问 `/stable/apps/my-app/console`
- **AND** APP 的 `stable_status` 为 `running`
- **THEN** 页面头部 SHALL 显示 `停止` 按钮

#### Scenario: Stable Console 为 stopped APP 提供启动和删除
- **WHEN** 用户访问 `/stable/apps/my-app/console`
- **AND** APP 的 `stable_status` 为 `stopped`
- **THEN** 页面头部 SHALL 显示 `启动` 和 `删除` 按钮

#### Scenario: Draft Console 提供删除入口
- **WHEN** 用户访问 `/draft/apps/my-app/console`
- **THEN** 页面头部 SHALL 显示 `删除 APP` 按钮
