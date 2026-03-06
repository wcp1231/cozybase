## 1. 平台数据层扩展

- [x] 1.1 在 `packages/daemon/src/core/platform-migrations.ts` 新增 migration（version 3），创建 `schedule_runs` 表与查询索引（至少覆盖 `app_slug + schedule_name + started_at`）。
- [x] 1.2 在 `packages/daemon/src/core/platform-repository.ts` 增加 `scheduleRuns` 数据访问能力（创建、状态更新、按 app+schedule 查询、保留策略清理）。
- [x] 1.3 为平台 migration 增加测试，验证 `schedule_runs` 表结构、索引与迁移可重复执行。

## 2. Schedule 配置解析

- [x] 2.1 新增 `packages/daemon/src/core/schedule-config.ts`，从 `app_files` 的 `app.yaml` 解析 `schedules` 配置。
- [x] 2.2 使用 `zod` 校验 schedule 字段并填充默认值（`enabled=true`、`concurrency=skip`、`timezone=UTC`、`timeout=30000`）。
- [x] 2.3 实现 `function` 解析规则（`file:exportName` / default 导出）与配置错误告警（错误配置仅跳过，不阻断 APP 其它流程）。
- [x] 2.4 新增解析测试覆盖合法配置、非法 cron、缺失字段、重复 schedule 名称等场景。

## 3. ScheduleManager 核心实现

- [x] 3.1 新增 `packages/daemon/src/core/schedule-manager.ts`，实现 `loadApp`、`unloadApp`、`reloadApp`、`shutdown`、`triggerManual` 方法与 app 级 job registry。
- [x] 3.2 接入 `croner` 完成 cron job 注册与取消，并确保仅 `enabled` 的 schedule 被自动加载。
- [x] 3.3 实现执行状态流转（`running/success/error/timeout/skipped`）并在 `schedule_runs` 中落库执行明细。
- [x] 3.4 实现并发策略 `skip`、`queue`（最多排队 1 个）、`parallel`，并为队列/跳过行为写入运行记录。
- [x] 3.5 实现超时控制（`AbortController` + `setTimeout`）与执行后保留最近 100 条记录的清理逻辑。

## 4. Function Runtime 能力扩展

- [x] 4.1 修改 `packages/runtime/src/modules/functions/types.ts`，将 `FunctionContext.req` 改为 `Request | undefined`，新增 `trigger: 'http' | 'cron'`。
- [x] 4.2 改造 `packages/runtime/src/modules/functions/context.ts`，支持 HTTP 与 cron 两类上下文构建。
- [x] 4.3 在 `packages/runtime/src/modules/functions/executor.ts` 增加可复用执行入口，支持按 `file:exportName` 解析并执行 schedule handler（不依赖 HTTP 请求）。
- [x] 4.4 更新函数开发说明与模板（`packages/daemon/guides/functions.md`、`packages/daemon/src/modules/apps/manager.ts` 的模板）以反映 `ctx.req` 判空和 `ctx.trigger` 用法。

## 5. Daemon 生命周期与 API 集成

- [x] 5.1 在 `packages/daemon/src/server.ts` 初始化 `ScheduleManager`，Daemon 启动时为 `stable_status=running` 的 APP 执行 `loadApp`，关闭时执行 `shutdown`。
- [x] 5.2 在 publish/start/stop 生命周期接入 schedule `reload/load/unload`，保证 Stable runtime 与 cron jobs 生命周期一致。
- [x] 5.3 在 APP 删除流程中接入 schedule 卸载，避免遗留 cron job 持续运行。
- [x] 5.4 新增手动触发端点 `POST /draft/apps/:appSlug/schedule/:scheduleName/trigger` 与 `POST /stable/apps/:appSlug/schedule/:scheduleName/trigger`，返回同步执行结果。
- [x] 5.5 为手动触发端点补齐错误处理（APP 不存在、schedule 不存在、handler 不存在、执行异常）与一致的 JSON 响应格式。

## 6. 测试与回归验证

- [x] 6.1 新增 `packages/daemon/tests/core/schedule-manager.test.ts`，覆盖 load/unload/reload、并发策略、超时、执行日志与清理策略。
- [x] 6.2 扩展 `packages/daemon/tests/modules/apps-api.test.ts`，覆盖 draft/stable 手动触发 API 的成功与失败路径。
- [x] 6.3 扩展 `packages/daemon/tests/modules/apps-manager.test.ts` 或相关集成测试，验证 start/stop/publish 与 ScheduleManager 生命周期联动。
- [x] 6.4 扩展 `packages/daemon/tests/modules/functions.test.ts`，验证 cron 场景 `ctx.req === undefined` 且 `ctx.trigger === 'cron'`。
- [x] 6.5 运行并通过受影响测试集（functions/apps-api/apps-manager/schedule-manager），确认无回归后再进入实现收尾。
