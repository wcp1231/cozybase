## Why

APP 运行时的错误信息（函数执行错误、Schedule 执行错误、构建错误）目前散落在 stdout 和 HTTP 响应中，没有统一存储。用户无法主动发现 APP 出了什么问题，Agent 也无法获取诊断信息来排查故障。需要构建一个 **"APP 运行状态和异常的单一信息源"**——用户通过 Console 页面查看，Agent 通过 MCP 工具获取同一份数据。

## What Changes

- 新增 `app_error_logs` 表，统一存储所有 ERROR 级别日志（error message + stack trace），附带写入限流（每 app 每分钟上限 30 条）和去重（相同 message 合并计数），保留策略为每 app+mode 最近 200 条
- 函数执行（HTTP 触发）产生的 500 错误写入 `app_error_logs`，当前这些错误仅作为 HTTP 响应返回后丢失
- Schedule 执行错误在写入 `schedule_runs` 的同时，也写入 `app_error_logs` 作为统一错误源
- 新增 Console HTTP API：
  - `GET /api/v1/apps/:slug/console` — 诊断概要（错误计数、Schedule 健康摘要、APP 状态）
  - `GET /api/v1/apps/:slug/errors` — 错误详情列表（带 stack trace，支持分页和过滤）
  - `GET /api/v1/apps/:slug/schedules` — Schedule 列表（含配置、运行状态、下次执行时间）
  - `GET /api/v1/apps/:slug/schedules/:name/runs` — 某个 Schedule 的运行历史
- 新增 MCP 工具（分层设计，避免污染 Agent 上下文）：
  - `get_app_console` — 轻量概要（错误计数、Schedule 健康状态），token 开销小
  - `get_app_errors` — 带 stack trace 的错误详情，支持 limit 和 source 过滤
- 新增 Web Console 页面（`/:mode/apps/:appName/console`），包含 Errors / Schedules / Database 三个标签页
- Draft 和 Stable 模式均支持 Console

## Capabilities

### New Capabilities

- `app-error-logs`: APP 错误日志的采集、存储、限流、去重和保留策略。定义 `app_error_logs` 数据模型、写入接口、以及错误源（HTTP 函数、Schedule、构建）的采集行为
- `app-console`: APP Console 的 HTTP API、MCP 工具和 Web 页面。定义诊断概要接口、错误查询接口、Schedule 状态查询接口，以及 MCP 工具的输入输出格式

### Modified Capabilities

- `function-runtime`: 函数执行产生的 ERROR 需要被采集并写入 `app_error_logs`（当前错误仅返回 HTTP 响应后丢失）
- `app-scheduled-tasks`: Schedule 执行错误需要同步写入 `app_error_logs`；新增 Schedule 列表查询能力（含运行状态和下次执行时间）

## Impact

- `packages/daemon` — platform-repository 新增 `app_error_logs` 表及 CRUD 方法；新增 Console API 路由；MCP server 新增工具注册
- `packages/runtime` — executor.ts 函数执行错误采集点，通过 PlatformClient 或回调机制写入错误日志
- `packages/web` — 新增 Console 页面组件及路由，Sidebar 新增导航入口
- `packages/agent` — MCP tool 类型定义更新
