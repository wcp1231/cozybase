## Context

当前 APP 的运行时错误（函数 500 错误、Schedule 执行失败、构建错误）散落在 stdout、HTTP 响应和 `schedule_runs` 表中，没有统一的存储和查询入口。用户无法主动发现问题，Agent 也无法获取诊断信息。

现有基础设施：
- `schedule_runs` 表已记录 Schedule 执行历史（含 error_message），但没有暴露查询 API
- `ScheduleManager` 持有 loadedApps Map（包含 Croner job 实例），能获取 next run 时间，但没有对外暴露
- 函数执行器 `executor.ts` 在 catch 块中构建 500 JSON 响应后信息丢失
- `PlatformClient` 接口目前只有 `call()` 方法，专注于 APP 间调用
- MCP server 通过 `CozybaseBackend` 接口（在 `packages/daemon/src/mcp/types.ts`）与 daemon 交互
- Web 前端通过 `app-layout.tsx` 管理 APP 页面布局，使用 React Router 路由

## Goals / Non-Goals

**Goals:**

- 建立 APP 运行时错误的统一存储，使所有 ERROR 级别错误可查询
- 提供 Console HTTP API 作为诊断数据的单一入口
- 提供 MCP 工具让 Agent 能获取诊断概要和错误详情
- 提供 Web Console 页面让用户浏览 Errors / Schedules / Database
- Draft 和 Stable 模式均可使用 Console

**Non-Goals:**

- 不做 realtime 推送（SSE / WebSocket），轮询即可
- 不做 INFO/DEBUG 级别日志采集，只采集 ERROR
- 不做性能监控 / metrics 采集
- 不拆分独立日志数据库
- Database 标签页不新建 API，复用现有 `_db/schemas`、`_db/tables`、`_db/sql` 路由

## Decisions

### Decision 1: 错误采集机制 — 回调注入模式

**选择**: 通过回调/observer 模式采集错误，由 daemon 在创建 runtime 时注入 error handler。

**备选方案**:

| 方案 | 描述 | 否决原因 |
|------|------|----------|
| 扩展 PlatformClient 接口 | 在 `PlatformClient` 上添加 `recordError()` | 混淆职责——PlatformClient 是 APP 间调用通道，不应承载日志写入 |
| Hono middleware 拦截 500 | 在 daemon 的路由层拦截函数 500 响应 | 需要解析 Response body 来提取信息，且丢失了函数名、trigger 等上下文 |
| Runtime 直写 SQLite | 让 runtime executor 直接写 platform.sqlite | 破坏 runtime 与 daemon 的分层，runtime 不应直接访问 platform DB |

**实现方式**:

定义一个轻量 `ErrorRecorder` 接口，注入到 runtime 的函数执行流程：

```typescript
// packages/runtime 中定义
interface ErrorRecorder {
  record(entry: {
    appSlug: string;
    runtimeMode: 'stable' | 'draft';
    sourceType: 'http_function' | 'schedule' | 'build';
    sourceDetail: string;     // 'GET /users' 或 'schedule:daily-sync'
    errorCode: string;        // 'FUNCTION_ERROR' | 'FUNCTION_LOAD_ERROR'
    errorMessage: string;
    stackTrace?: string;
  }): void;  // fire-and-forget, 不阻塞主流程
}
```

- Daemon 在启动时创建 `ErrorRecorder` 实现（写入 `app_error_logs` 表 + 限流/去重）
- 注入点：executor.ts 的 catch 块、ScheduleManager 的执行错误回调
- `record()` 方法是 fire-and-forget（异步写入，不阻塞函数响应）

### Decision 2: 存储方案 — platform.sqlite + WAL 模式

**选择**: 在现有 `platform.sqlite` 中新增 `app_error_logs` 表，启用 WAL 模式。

**理由**: Cozybase 是本地开发工具，并发量有限。带限流后写入量可控（最多 30 条/分钟/app），WAL 模式下读写不互相阻塞。没有必要引入额外的日志数据库。

**数据模型**:

```sql
CREATE TABLE app_error_logs (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  app_slug       TEXT NOT NULL,
  runtime_mode   TEXT NOT NULL,       -- 'stable' | 'draft'
  source_type    TEXT NOT NULL,       -- 'http_function' | 'schedule' | 'build'
  source_detail  TEXT,                -- 'GET /users' | 'schedule:daily-sync'
  error_code     TEXT,                -- 'FUNCTION_ERROR' | 'FUNCTION_LOAD_ERROR' | 'TIMEOUT'
  error_message  TEXT NOT NULL,
  stack_trace    TEXT,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_error_logs_app_mode ON app_error_logs(app_slug, runtime_mode);
CREATE INDEX idx_error_logs_created ON app_error_logs(created_at);
```

**限流和去重策略**:
- **限流**: 每个 `app_slug + runtime_mode` 每分钟最多写入 30 条。超出部分静默丢弃。限流计数器在 daemon 内存中维护，跟随进程生命周期
- **去重**: 写入前检查最近 60 秒内是否有相同 `app_slug + source_detail + error_message` 的记录。如有，UPDATE `occurrence_count += 1` 和 `updated_at`，不新建行
- **保留策略**: 每次写入后检查，每个 `app_slug + runtime_mode` 最多保留 200 条，超出时删除最旧记录
- **Draft 生命周期**: Publish 成功后清空该 APP 的 draft 错误日志（`DELETE FROM app_error_logs WHERE app_slug = ? AND runtime_mode = 'draft'`）。Draft 错误是开发迭代产物，publish 成功意味着这些错误已被修复，保留无意义

### Decision 3: ScheduleManager 查询 API

**选择**: 在 `ScheduleManager` 上添加 `getAppScheduleStatus(appSlug)` 公开方法。

返回每个 schedule 的配置 + 运行状态：
- Schedule 配置（name, cron, enabled, function, concurrency, timeout）来自 `loadedApps.schedules`
- 下次执行时间来自 Croner 的 `job.nextRun()` 方法
- 最近一次运行状态从 `schedule_runs` 表查询（`findByAppAndSchedule` 取 limit=1）

对于未 loaded 的 APP（Draft 模式或已停止），从 `app.yaml` 解析 schedule 配置但不提供 nextRun。

### Decision 4: MCP 工具分层设计 — 概要 + 详情

**选择**: 两个 MCP 工具，分层避免上下文污染。

**`get_app_console`** — 概要（约 200-400 tokens）:
```typescript
{
  app_name: string,
  mode?: 'stable' | 'draft'  // 默认 'stable'
}
→ {
  app_status: { stable_running, current_version, published_version },
  error_summary: {
    total_24h: number,
    by_source: Record<string, number>,
    latest?: { source, message, created_at }  // 仅最新 1 条，无 stack trace
  },
  schedules_summary: {
    total: number,
    healthy: number,
    failing: number,
    failing_names: string[]
  }
}
```

**`get_app_errors`** — 详情（按需调用）:
```typescript
{
  app_name: string,
  mode?: 'stable' | 'draft',
  limit?: number,              // 默认 10
  source_type?: string         // 可选过滤
}
→ {
  errors: [{
    source_type, source_detail, error_code,
    error_message, stack_trace,
    occurrence_count, created_at
  }]
}
```

MCP 工具和 Console HTTP API 共享同一套 backend 方法（在 `CozybaseBackend` 接口上扩展），保证数据一致性。

### Decision 5: Console HTTP API 路由设计

新增 4 个 API 端点，挂在现有 `/api/v1/apps/:slug/` 路径下：

```
GET /api/v1/apps/:slug/console?mode=stable
  → 诊断概要（error summary + schedules summary + app status）

GET /api/v1/apps/:slug/errors?mode=stable&limit=20&source_type=http_function
  → 错误列表详情

GET /api/v1/apps/:slug/schedules
  → Schedule 列表（配置 + 状态 + nextRun）

GET /api/v1/apps/:slug/schedules/:name/runs?limit=20
  → 某个 Schedule 的运行历史
```

这些路由注册在 daemon 的 `server.ts` 中，与现有 `/api/v1/apps/` 路由组一致。

### Decision 6: Web UI 路由和组件结构

**路由**: 在现有 app-layout 下增加 `/console` 子路由：
- `/:mode/apps/:appName/console` — Console 页面

**Sidebar 入口**: 在 `app-sidebar.tsx` 的导航中增加 Console 入口（使用 `Terminal` 或 `Activity` 图标）。

**页面结构**: Tab 式布局，三个标签页：
- **Errors** — 错误列表（默认标签页），展示最近错误，点击展开 stack trace
- **Schedules** — Schedule 列表 + 运行历史 + 手动触发按钮
- **Database** — 复用已有 `_db/` API 的表浏览器和 SQL 查询面板

Console 页面在 Draft 和 Stable 模式下都可访问。Draft 模式下 Schedules 标签页不显示 nextRun（无 cron job 运行），但可以执行手动触发。

## Risks / Trade-offs

**[SQLite 错误风暴]** → 通过限流（30条/分钟/app）+ 去重（相同 message 合并计数）缓解。最坏情况下每分钟 30 次 INSERT，对 SQLite WAL 模式无压力。

**[ErrorRecorder 注入增加 runtime 与 daemon 的耦合]** → ErrorRecorder 是可选接口（不提供时 executor 行为不变）。runtime 只依赖接口定义，不依赖 daemon 实现。

**[MCP 工具概要信息可能不足以定位问题]** → 这是有意设计：概要提供方向，Agent 按需调用 `get_app_errors` 获取详情。分层避免一次性返回过多 stack trace 污染上下文。

**[Console Web 页面的数据库标签页与现有数据库 UI 可能重复]** → 当前没有独立的数据库浏览 UI。Console 的 Database 标签页是 APP 下唯一的数据库入口，直接复用 `_db/` API，不存在重复建设。
