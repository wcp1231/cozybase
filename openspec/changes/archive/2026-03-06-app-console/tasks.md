## 1. 平台错误日志存储

- [x] 1.1 在 `packages/daemon/src/core/platform-migrations.ts` 新增 migration，创建 `app_error_logs` 表与查询索引，并确认 `platform.sqlite` 使用 WAL 兼容当前读写模式。
- [x] 1.2 在 `packages/daemon/src/core/platform-repository.ts` 增加 `appErrorLogs` 数据访问能力，支持创建/去重更新、按 app+mode 查询、24 小时聚合、分页读取和每 app+mode 保留最近 200 条。
- [x] 1.3 在 daemon 侧实现每个 `app_slug + runtime_mode` 每分钟最多 30 条新错误记录的限流，并补上按 APP 清理 Draft 错误日志的仓储方法。

## 2. Runtime 错误采集接入

- [x] 2.1 在 `packages/runtime/src/modules/functions/types.ts`、`context.ts`、`executor.ts` 引入可选 `ErrorRecorder` 接口和统一错误元数据结构，保持 runtime 对 daemon 实现无硬依赖。
- [x] 2.2 在 HTTP 函数执行和模块加载失败路径接入 fire-and-forget 错误记录，确保普通 `Error` 会写入 `app_error_logs`，而 `AppError` 和原始 HTTP 响应语义保持不变。
- [x] 2.3 在 daemon 创建 runtime 时注入 `ErrorRecorder` 实现，统一记录 Stable/Draft 的 `http_function` 与 `build` 错误来源。

## 3. Schedule 与生命周期集成

- [x] 3.1 扩展 `packages/daemon/src/core/schedule-manager.ts`，新增 APP 级 schedule 状态查询能力，返回配置、最近一次运行摘要和已加载 Stable job 的 `nextRun`。
- [x] 3.2 在 schedule 执行以 `error` 或 `timeout` 结束时同步写入 `app_error_logs`，并确保 `success`、`skipped` 不自动产生错误日志。
- [x] 3.3 在 publish 成功及相关 APP 生命周期流程中清理该 APP 的 Draft 错误日志，保证 Stable 与 Draft 错误数据隔离。

## 4. Console Backend、HTTP API 与 MCP

- [x] 4.1 在 `packages/daemon/src/mcp/types.ts` 及 backend 实现中新增 console、errors、schedules、schedule runs 查询方法，复用同一套聚合逻辑供 HTTP API 和 MCP 使用。
- [x] 4.2 在 `packages/daemon/src/server.ts` 或 `packages/daemon/src/modules/apps/routes.ts` 注册 `GET /api/v1/apps/:slug/console`、`/errors`、`/schedules`、`/schedules/:name/runs`，补齐 `mode`、`limit`、`offset`、`source_type` 参数校验和 `404` 处理。
- [x] 4.3 在 MCP server 注册 `get_app_console` 与 `get_app_errors`，定义输入 schema、输出结构，并接入新的 backend 查询能力。

## 5. Web Console 页面

- [x] 5.1 在 `packages/web/src/pages/app-layout.tsx` 和 `packages/web/src/features/shell/app-sidebar.tsx` 增加 `/:mode/apps/:appName/console` 路由与导航入口。
- [x] 5.2 实现 Console 页的 `Errors` 标签页，展示诊断概要、错误列表、来源过滤、分页与 stack trace 展开。
- [x] 5.3 实现 `Schedules` 标签页，展示 schedule 状态、运行历史，并在 Stable/Draft 模式下正确处理 `nextRun` 与手动触发入口。
- [x] 5.4 实现 `Database` 标签页，复用现有 `_db/schemas`、`_db/tables`、`_db/sql` 接口与页面能力，不新增数据库 API。

## 6. 测试与回归验证

- [x] 6.1 新增或扩展平台数据层测试，覆盖 `app_error_logs` migration、去重、限流、保留策略和 Draft 清理行为。
- [x] 6.2 扩展 runtime 与 schedule 测试，覆盖 HTTP 500 采集、`AppError` 不写日志、schedule `error/timeout` 写日志，以及 schedule 状态查询结果。
- [x] 6.3 扩展 APP API、MCP 和 Web 测试，覆盖 Console HTTP 端点、MCP 工具返回以及 Console 路由/标签页渲染。
- [x] 6.4 运行受影响测试集并修复回归，至少验证 daemon、runtime、web 三个受影响包的相关用例通过。
