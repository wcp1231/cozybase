## Context

CozyBase 的 APP Function 当前仅支持 HTTP 触发。`croner` 库已在 `package.json` 依赖中但未使用。`app.yaml` 当前仅包含 `description` 字段。定时任务需要在 Stable 环境下运行，与现有的 start/stop/publish 生命周期集成。

## Goals / Non-Goals

**Goals:**
- 通过声明式配置（`app.yaml` 的 `schedules` 字段）支持 APP 定时任务
- 复用现有 Function 文件和 `executeFunction` 基础设施
- 提供执行历史记录和并发控制
- 在 Draft 环境提供手动触发 API 用于测试

**Non-Goals:**
- 不支持分布式调度（当前为单节点 Daemon）
- 不支持 cron 表达式的可视化编辑器（UI 层面后续再做）
- 不做任务依赖链（task A 完成后触发 task B）
- 不支持 retry 策略（失败后不自动重试，后续可扩展）

## Decisions

### Decision 1: Schedule 配置位置 — `app.yaml` 声明式

在 `app.yaml` 中新增 `schedules` 数组字段：

```yaml
description: My data scraper

schedules:
  - name: daily-scrape
    cron: "0 9 * * *"
    function: scrape:fetchAll     # file:exportName
    enabled: true                 # 默认 true
    concurrency: skip             # skip | queue | parallel
    timezone: Asia/Shanghai       # 默认 UTC
    timeout: 30000                # 默认 30s
```

**为什么不用独立的 `schedules.yaml` 或 `schedules/` 目录：** APP 的所有配置集中在 `app.yaml` 一个文件中，方便 Agent 和开发者理解和修改。Schedule 配置量通常很小，不需要独立文件。

### Decision 2: Handler 引用格式 — `file:exportName`

`function` 字段使用 `file:exportName` 格式引用 Function 文件中的命名导出：
- `scrape:fetchAll` → `functions/scrape.ts` 的 `fetchAll` 导出
- `cleanup` → `functions/cleanup.ts` 的 `default` 导出（无冒号时）

**为什么不用新的导出约定（如 `CRON` export）：** 复用命名导出更灵活，一个文件可以同时包含多个 cron handler 和 HTTP handler，无需引入新约定。

### Decision 3: ScheduleManager 组件架构

新增 `packages/daemon/src/core/schedule-manager.ts`，职责：

```
ScheduleManager
├── loadApp(slug)      — 解析 app.yaml，为每个 schedule 创建 croner Cron job
├── unloadApp(slug)    — 停止该 app 的所有 cron jobs
├── reloadApp(slug)    — unload + load
├── triggerManual(slug, scheduleName) — 手动执行（用于 Draft 测试）
└── shutdown()         — 停止所有 cron jobs
```

ScheduleManager 在 `server.ts` 中创建，接收 `workspace`、`registry`、`platformDb` 依赖。

**生命周期集成点：**

| 事件 | 动作 |
|------|------|
| Daemon 启动 | 遍历 `stableStatus === 'running'` 的 APP，`loadApp` |
| `publish` 成功 | `reloadApp(slug)`（因为 app.yaml 可能变更） |
| `startStable` | `loadApp(slug)` |
| `stopStable` | `unloadApp(slug)` |
| `delete app` | `unloadApp(slug)` |
| Daemon shutdown | `shutdown()` |

### Decision 4: Schedule 执行流程

cron job 触发时的执行流程：

1. 检查并发策略：
   - `skip`: 检查是否有同名 schedule 正在运行，有则写一条 `skipped` 记录并返回
   - `queue`: 如果正在运行，排队等待（队列深度最多 1，超出则 skip）
   - `parallel`: 直接执行
2. 在 `schedule_runs` 表插入一条 `status=running` 记录
3. 从 Registry 获取 Stable 模式的 `AppEntry`
4. 加载 Function 模块，解析 `file:exportName` 找到 handler
5. 构建 `FunctionContext`（`req` 为 `undefined`，其余字段与 HTTP 触发相同）
6. 执行 handler，捕获结果/异常
7. 更新 `schedule_runs` 记录为 `success` 或 `error`
8. 清理超过 100 条的旧记录（per app+schedule）
9. 如果超时（通过 `AbortController` + `setTimeout`），更新为 `timeout`

### Decision 5: `FunctionContext.req` 改为可选

`FunctionContext` 接口中的 `req` 类型从 `Request` 改为 `Request | undefined`。

**为什么不用虚拟 Request：** 构造假 Request 会误导开发者，导致对 `req.url`、`req.headers` 等字段的错误假设。明确为 `undefined` 让开发者通过类型检查区分 HTTP 触发和 cron 触发。

**影响范围：** 现有 HTTP 触发的 Function 不受影响（`req` 始终存在）。只有 cron handler 需要处理 `req` 可能为 `undefined` 的情况。在 `FunctionContext` 中新增 `trigger: 'http' | 'cron'` 字段辅助区分。

### Decision 6: `schedule_runs` 表和自动清理

表结构在 `platform.sqlite`（非 APP 级 SQLite），因为 schedule 管理是平台级行为。

自动清理策略：每次 cron job 执行完毕后，删除该 app+schedule 组合下超过 100 条的最旧记录。使用 SQL：

```sql
DELETE FROM schedule_runs
WHERE id NOT IN (
  SELECT id FROM schedule_runs
  WHERE app_slug = ? AND schedule_name = ?
  ORDER BY started_at DESC
  LIMIT 100
)
AND app_slug = ? AND schedule_name = ?
```

### Decision 7: 手动触发 API

新增端点 `POST /draft/apps/:appSlug/schedule/:scheduleName/trigger`：
- 从 app_files 中读取 `app.yaml`，解析 schedules 配置
- 找到匹配的 schedule，在 Draft 模式下执行对应 handler
- 返回执行结果（同步等待完成）
- 同样写入 `schedule_runs` 表，`status` 标记为手动触发来源

也支持 Stable 模式触发：`POST /stable/apps/:appSlug/schedule/:scheduleName/trigger`，用于在 UI 上手动执行已部署的定时任务。

### Decision 8: app.yaml 解析时机

Schedule 配置需要从 `app.yaml` 文件内容中解析。当前 `app.yaml` 存储在 `app_files` 表中。

- **Stable 模式**：publish 时 `app.yaml` 已导出到 `stable/{slug}/app.yaml`，但实际上当前的 `exportFunctions` 只导出 `functions/` 目录。改为从 `app_files` 表直接读取 `app.yaml` 内容解析，避免依赖文件系统导出。
- **Draft 模式（手动触发）**：同样从 `app_files` 表读取。

## Risks / Trade-offs

- **单节点限制** → 当前 CozyBase 为单 Daemon 架构，cron 不需要分布式锁。未来多节点时需引入 leader election。暂不处理。
- **长时间运行任务阻塞** → timeout 机制兜底（默认 30s）。开发者可配置更长 timeout。使用 `AbortController` 实现，但注意 Bun 中 AbortSignal 对同步代码无效，只对 `fetch`/`Bun.sleep` 等异步操作生效。
- **app.yaml 解析错误** → 如果 `schedules` 配置格式错误，`loadApp` 应 log 警告并跳过（不影响 APP 其他功能的正常运行）。使用 Zod schema 验证。
- **BREAKING: `FunctionContext.req` 变为可选** → 现有用户函数如果直接访问 `ctx.req` 不会立即报错（运行时 `req` 仍然是 `Request`），但 TypeScript 类型检查会提示需要判空。影响范围可控。
