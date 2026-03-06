## Why

APP 开发者需要定时执行后台任务（如每天抓取数据、每周生成报告、定期清理过期记录等）。当前 CozyBase 的 Function 仅支持 HTTP 触发，无法满足定时自动执行的需求。引入 Schedule 机制使 APP 成为一个更完整的后端平台。

## What Changes

- 在 `app.yaml` 中新增 `schedules` 声明式配置，支持 cron 表达式定义定时任务
- Schedule handler 复用现有 Function 文件，通过 `function: file:exportName` 引用命名导出
- 新增 `ScheduleManager` 组件，基于 `croner` 库管理 cron job 生命周期
- 定时任务仅在 Stable 环境下自动执行；Draft 环境提供手动触发 API 用于测试
- 在 `platform.sqlite` 中新增 `schedule_runs` 表记录执行历史（每 app+schedule 保留最近 100 条）
- 新增 `FunctionContext.req` 改为可选字段，因为 cron 触发时没有 HTTP 请求
- 新增手动触发 API：`POST /draft/apps/:appName/schedule/:scheduleName/trigger`
- 支持三种并发策略：`skip`（默认）、`queue`（最多排 1 个）、`parallel`

## Capabilities

### New Capabilities
- `app-scheduled-tasks`: 定义 APP 定时任务的声明式配置（app.yaml schedules）、ScheduleManager 生命周期管理、cron 执行引擎、执行日志记录、手动触发 API、并发控制策略

### Modified Capabilities
- `function-runtime`: `FunctionContext.req` 从必填改为可选，以支持 cron 触发场景（无 HTTP 请求）
- `app-stable-lifecycle`: Stable 版本 start/stop/publish 时需触发 ScheduleManager 的 load/unload/reload

## Impact

- **代码**：新增 `packages/daemon/src/core/schedule-manager.ts`；修改 `server.ts` 注册 ScheduleManager；修改 `AppManager` 的 publish/start/stop 流程集成 schedule 生命周期
- **数据库**：`platform.sqlite` 新增 `schedule_runs` 表和 migration
- **依赖**：`croner` 已在 `package.json` 中，无需新增依赖
- **API**：新增手动触发端点 `POST /draft/apps/:appName/schedule/:scheduleName/trigger`
- **类型**：`FunctionContext.req` 类型从 `Request` 改为 `Request | undefined`（**BREAKING** 对现有函数类型签名）
