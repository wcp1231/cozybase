## Context

当前 Cozybase 的 Agent 体系：

```
RuntimeAgentSession<TConfig>           ← 共享 session skeleton
├── ChatSession (Builder)              ← per-app，APP 开发
└── OperatorSession (Operator)         ← per-app，APP 使用
```

每个 session 永久绑定一个 `appSlug`。ChatSessionManager / OperatorSessionManager 是 `Map<appSlug, Session>` 结构。

现有可复用的基础设施：
- `RuntimeAgentSession`：统一的 session 生命周期（connect、prompt、cancel、event buffer、snapshot persist）
- `packages/ai-runtime`：统一的 provider/runtime registry（Claude Code、Codex、pi-agent-core）
- `EventBus`：daemon 级 pub/sub，目前仅用于 `app:reconciled` 事件
- `RuntimeSessionStore`：SQLite 持久化 session snapshot 和投影 history
- Builder MCP tools：30+ 工具完整覆盖 APP 生命周期
- Operator MCP tools：数据面工具（query、create、update、delete、call_function）

CozyBase Agent 的定位：

| 维度 | Builder Agent | Operator Agent | CozyBase Agent |
|------|---------------|----------------|----------------|
| 绑定 | 单个 APP | 单个 APP | 无绑定，跨 APP |
| 职责 | 编写代码、构建 APP | 操作数据、使用 APP | 理解意图、委派任务 |
| 工具 | 30+ MCP tools (源码面) | 6+ tools (数据面) | ~8 高层工具 (委派面) |
| LLM 要求 | 高（编码能力） | 中（意图理解） | 低（路由 + 摘要） |
| 耗时 | 1-5 分钟 | 秒级 | 秒级（自身）+ 委派耗时 |

## Goals / Non-Goals

**Goals:**
- 用户可以通过唯一对话入口完成所有 Cozybase 操作：创建 APP、修改 APP、使用 APP、管理 APP
- CozyBase Agent 理解用户意图后，将任务委派给正确的 Builder/Operator session 执行
- 委派采用异步模型：用户不需要等待 Builder 完成，可以继续对话做其他事
- CozyBase Agent 的消息历史独立持久化，跨多个 APP 的交互串在一条对话线中
- 支持用户自选 LLM provider/model，推荐使用轻量模型降低成本

**Non-Goals:**
- 不替代现有的 per-app Builder/Operator 入口（两者共存）
- 不实现跨 APP 联动（如"把记账本的数据导入到报表 APP"）
- 不实现多用户隔离
- 不实现 ACP 协议（ACP 作为独立 change，依赖 CozyBase Agent）
- 不实现 Web UI 前端页面（后续独立 change）

## Decisions

### Decision 1: CozyBase Agent 不继承 RuntimeAgentSession

**选择：** CozyBase Agent 的 session 实现（`CozyBaseSession`）不继承 `RuntimeAgentSession`，而是一个独立的 session 类，直接使用 `packages/ai-runtime` 创建 agent runtime。

**原因：**
- `RuntimeAgentSession` 的设计假设是"一个 session 绑定一个 APP"，包括 `appSlug` 构造参数、per-app 的系统 prompt 构建、per-app 的 MCP server 注册
- CozyBase Agent 不绑定任何 APP，它的工具集是固定的委派工具，不需要 per-app 的 MCP server
- 强行继承会导致大量 override 和空实现

**替代方案：** 重构 `RuntimeAgentSession` 使 `appSlug` 可选。但这会影响 Builder 和 Operator 的类型安全性，且 CozyBase Agent 的 session 生命周期与 per-app session 差异较大（无 appSlug、无 per-app MCP、无 reconcile 监听）。

**复用方式：** CozyBase Agent 直接使用 `packages/ai-runtime` 的 `AgentRuntimeProvider.createQuery()` 创建 agent 查询，自行管理 session 生命周期。复用 `RuntimeSessionStore` 做持久化（usage_type 为 `'cozybase'`，app_slug 为固定值如 `'__cozybase__'`）。

### Decision 2: 工具集采用委派模型，而非全量工具

**选择：** CozyBase Agent 拥有约 8 个高层工具：

**直接工具**（Agent 自己执行，通过 AppManager / daemon 内部 API 调用）：

| 工具 | 描述 |
|------|------|
| `list_apps` | 列出所有 APP 及其状态 |
| `get_app_detail` | 获取某个 APP 的详细信息（状态、版本、页面列表、function 列表） |
| `start_app` | 启动 APP 的 Stable 运行时 |
| `stop_app` | 停止 APP 的 Stable 运行时 |
| `delete_app` | 删除 APP |

**委派工具**（发起异步任务，由 Builder/Operator session 执行）：

| 工具 | 描述 |
|------|------|
| `create_app` | 创建新 APP 并委派 Builder 构建。输入：idea (string)。立即返回 APP slug 和 task ID。 |
| `develop_app` | 委派 Builder Agent 对已有 APP 进行开发。输入：app_name, instruction。立即返回 task ID。 |
| `operate_app` | 委派 Operator Agent 执行数据操作。输入：app_name, instruction。等待完成并返回结果。 |

**原因：**
- 关注点分离：CozyBase Agent 专注意图理解和路由，复杂的编码 / 数据操作由专门的 Agent 完成
- 上下文隔离：Builder session 的代码上下文不污染 CozyBase Agent 的对话上下文
- 模型分层：CozyBase Agent 用轻量模型（便宜快速），Builder/Operator 用各自配置的模型（能力匹配任务复杂度）

**替代方案：** 让 CozyBase Agent 直接持有全部 40+ 工具。问题：工具数量过多导致 LLM 选择困难；Builder/Operator 的工具名可能冲突（如 `execute_sql`）；上下文窗口被工具描述占满。

### Decision 3: 所有委派工具统一异步

**选择：** 三个委派工具全部采用异步模型，统一通过 TaskRegistry 管理：

- `create_app` → **异步**：创建 APP 后立即返回 slug + taskId，Builder 在后台构建
- `develop_app` → **异步**：立即返回 taskId，Builder 在后台执行
- `operate_app` → **异步**：立即返回 taskId，Operator 在后台执行，完成后通知

```
统一异步委派流程：
━━━━━━━━━━━━━━━━

  CozyBase Agent 调用 develop_app("ledger", "加一个报表页面")
    │
    ├── 1. daemon 获取/创建 Builder ChatSession("ledger")
    ├── 2. 将任务入队 TaskRegistry（per-app 队列）
    ├── 3. 如果该 APP 当前无运行中任务 → 立即执行 injectPrompt
    │      如果该 APP 当前有运行中任务 → 排队等待
    └── 4. 立即返回 { taskId: "task_xxx", appSlug: "ledger", status: "queued" | "running" }

  CozyBase Agent 回复用户：
    "正在为记账本添加报表页面，完成后会通知你。"

  后台：Builder Agent 执行完成
    │
    ├── afterPrompt() 触发
    ├── EventBus.emit('task:completed', { taskId, appSlug, summary })
    ├── TaskRegistry 检查该 APP 的队列 → 如有下一个任务 → 自动执行
    └── CozyBaseSession 收到事件
         │
         └── 注入通知消息到 CozyBase Agent 的对话流：
             "[系统通知] 记账本的开发任务已完成：已添加月度报表页面。"


  CozyBase Agent 调用 operate_app("ledger", "帮我记一笔 200 元午餐")
    │
    ├── 1. daemon 获取/创建 Operator OperatorSession("ledger")
    ├── 2. 将任务入队 TaskRegistry（per-app 队列）
    ├── 3. 如果该 APP 的 Operator 当前无运行中任务 → 立即执行
    └── 4. 立即返回 { taskId: "task_xxx", appSlug: "ledger", status: "running" }

  CozyBase Agent 回复用户：
    "正在帮你记录，稍等。"

  后台：Operator Agent 完成（通常秒级）
    │
    └── EventBus.emit('task:completed', { taskId, summary: "已记录一笔 200 元午餐支出" })
        │
        └── CozyBaseSession → "[系统通知] 操作完成：已记录一笔 200 元午餐支出"
            → CozyBase Agent LLM → "已记录。"
```

**原因：**
- 统一异步模型简化了工具接口——所有委派工具行为一致，LLM 更容易理解
- Per-app 任务队列保证同一个 APP 的操作顺序执行，避免并发冲突（如两个 operate_app 同时写同一张表）
- 即使 Operator 任务通常秒级完成，异步模型也不会有明显体验差异——通知几乎立即到达
- 未来如果一个 APP 同时收到 develop + operate 请求，队列机制天然保证串行，不会出现 Builder 在改表结构同时 Operator 在读旧表的情况

### Decision 4: 异步任务管理——TaskRegistry

**选择：** 在 daemon 中新增 `TaskRegistry`，管理 CozyBase Agent 发起的异步委派任务。

```typescript
interface DelegatedTask {
  taskId: string;           // 唯一标识
  appSlug: string;          // 目标 APP
  type: 'create' | 'develop' | 'operate';  // 任务类型
  target: 'builder' | 'operator';          // 目标 session 类型
  instruction: string;      // 用户原始指令
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;       // 从队列中取出开始执行的时间
  completedAt?: string;
  summary?: string;         // 完成后的结果摘要
  error?: string;           // 失败原因
}
```

TaskRegistry 的职责：
- **入队**：委派工具调用时将任务加入 per-app 队列
- **调度**：每个 APP 的每种 target（builder / operator）维护独立队列，同一队列内串行执行
- **状态更新**：session 完成/失败时更新任务状态
- **自动推进**：当前任务完成后自动取出队列中的下一个任务执行
- **查询**：CozyBase Agent 可以用 `check_task` 工具查看进度
- **通知**：通过 EventBus 发布 `task:completed` / `task:failed` 事件

Per-app 队列模型：

```
TaskRegistry 内部结构：

  queues: Map<string, DelegatedTask[]>

  key = "{appSlug}:{target}"

  例：
    "ledger:builder"   → [ task_001(running), task_002(queued) ]
    "ledger:operator"  → [ task_003(running) ]
    "todo:builder"     → [ task_004(running) ]

  同一个 APP 的 builder 和 operator 队列独立：
  - builder 队列串行（避免 Builder Agent 并发修改源码）
  - operator 队列串行（避免并发数据操作冲突）
  - builder 和 operator 之间可以并行（不同 session 类型互不干扰）
```

**存储：** 内存中维护（daemon 重启后丢失）。Phase 1 不持久化任务状态——如果 daemon 重启，正在执行的任务会丢失，但 Builder/Operator session 本身有 snapshot 持久化，用户可以通过委派工具重新触发。

**原因：**
- 需要一种方式追踪"哪些后台任务在跑"和"哪些在排队"
- Per-app 串行队列保证数据一致性
- EventBus 是 fire-and-forget，不保存状态；TaskRegistry 补充了状态追踪和调度能力
- 内存存储足够 Phase 1，避免过度工程

### Decision 5: Builder/Operator session 的完成通知

**选择：** 扩展 `RuntimeAgentSession` 的 `afterPrompt()` 钩子，在委派任务完成时通过 EventBus 通知：

```typescript
// runtime-agent-session.ts 的 prompt() 方法末尾
protected afterPrompt(): void {
  // 子类可 override
}

// Builder ChatSession 扩展
protected afterPrompt(): void {
  this.runEventBuffer = [];
  // 新增：如果有关联的委派任务，发布完成事件
  if (this.delegatedTaskId) {
    this.eventBus.emit('task:completed', {
      taskId: this.delegatedTaskId,
      appSlug: this.appSlug,
      summary: this.extractLastAssistantMessage(),
    });
    this.delegatedTaskId = null;
  }
}
```

CozyBaseSession 在构造时订阅 EventBus：

```typescript
this.eventBus.on('task:completed', (data) => {
  // 将完成通知注入到 CozyBase Agent 的对话流
  this.injectSystemNotification(
    `[任务完成] APP "${data.appSlug}" 的开发任务已完成：${data.summary}`
  );
});
```

**"注入系统通知"的实现方式：** 通过 `injectPrompt()` 发送一条带有特殊前缀的消息，让 LLM 知道这是系统通知而非用户输入：

```
[系统通知] APP "ledger" 的开发任务已完成：已添加月度报表页面，包含按分类汇总的数据表。

请将此结果告知用户。
```

**原因：**
- 利用现有的 `afterPrompt()` 钩子和 EventBus 基础设施
- 不需要修改 runtime 层或 provider 层
- 注入通知的方式让 LLM 自然地将结果融入对话

**Trade-off：** 注入通知会触发一次 LLM 调用（让 Agent 消化通知并回复用户），有额外成本。但这是必要的——用户期望 Agent 主动告知结果。

**边界情况：** 如果 CozyBase Agent 正在处理其他 prompt 时收到任务完成通知，需要排队等待当前 prompt 处理完毕后再注入。可以用简单的消息队列实现。

### Decision 6: System Prompt 设计

**选择：** CozyBase Agent 的 system prompt 包含：

```
你是 CozyBase Agent，Cozybase 平台的核心 AI 助手。

你的能力：
- 管理应用：创建、启停、删除、查看状态
- 开发应用：委派 Builder Agent 完成代码开发
- 使用应用：委派 Operator Agent 执行数据操作

## 工具使用指南

### 直接工具
- list_apps：查看所有应用
- get_app_detail：查看应用详情
- start_app / stop_app：启停应用
- delete_app：删除应用

### 委派工具
- create_app(idea)：创建新应用并委派 Builder 构建。异步操作，立即返回 taskId。
- develop_app(app_name, instruction)：委派 Builder Agent 对应用进行开发。异步操作。
- operate_app(app_name, instruction)：委派 Operator Agent 执行数据操作。异步操作。

## 异步任务
所有委派工具都是异步操作。调用后会立即返回 taskId，任务在后台执行。
你应当告诉用户任务已开始，并在收到 [系统通知] 时将结果告知用户。
同一个应用的同类任务会自动排队顺序执行。

## 交互规范
- 始终先用 list_apps 了解当前有哪些应用
- 在操作具体应用前，确认应用名称
- develop_app 的 instruction 应当清晰描述需求
- operate_app 的 instruction 应当明确指定操作内容
```

**原因：** 轻量 LLM 需要明确的工具使用指引，减少误判。

### Decision 7: LLM provider 和 model 配置通过 settings 表

**选择：** CozyBase Agent 的 LLM 配置通过 `platform_settings` 表存储，与 Builder Agent 和 Operator Agent 的配置模式完全一致：

**存储 key：**
- `cozybase_agent.agent_provider`：runtime provider（如 `claude-code`、`codex`、`pi-agent-core`）
- `cozybase_agent.model_provider`：底层模型厂商（仅 `pi-agent-core` 时使用）
- `cozybase_agent.model`：具体模型（如 `claude-haiku`）

**API 端点：**
- `GET /api/v1/settings/cozybase-agent`：读取当前配置
- `PUT /api/v1/settings/cozybase-agent`：更新配置

**运行时解析：** 与 Builder/Operator 相同的三级 fallback：

```
1. platform_settings 表中的存储值
2. 环境变量 COZYBASE_AGENT_PROVIDER / COZYBASE_AGENT_MODEL
3. 默认值：agent_provider=claude-code, model=claude-haiku
```

**原因：**
- 与 Builder Agent (`agent.*`) 和 Operator Agent (`operator.*`) 配置模式对称
- 通过 settings API 暴露后，前端 Settings 页面可以统一管理所有 Agent 的 LLM 配置
- 支持运行时动态切换，不需要重启 daemon

### Decision 8: WebSocket 端点

**选择：** 新增 `/api/v1/cozybase/ws` 端点，不带 `?app=` 参数。

```typescript
// index.ts WebSocket upgrade
if (url.pathname === '/api/v1/cozybase/ws') {
  upgrade(req, { type: 'cozybase' });
}

// WebSocket handler
case 'cozybase':
  const session = cozybaseSessionManager.getOrCreate();
  session.connect(ws);
  break;
```

**原因：** CozyBase Agent 不绑定 APP，所以不需要 `appSlug` 参数。单用户场景下只有一个 CozyBase session。

### Decision 9: operate_app 的异步执行与队列

**选择：** `operate_app` 与 `create_app`、`develop_app` 一样，入队 TaskRegistry 后立即返回。Operator session 在后台执行，完成后通过 EventBus 通知 CozyBaseSession。

**原因：**
- 统一行为模型：三个委派工具的接口完全一致，`{ taskId, appSlug, status }` 返回格式统一
- 并发安全：如果用户快速连续发出"记一笔 200 元午餐"和"记一笔 50 元咖啡"，per-app operator 队列保证两个操作顺序执行，不会并发写入冲突
- 简化 LLM 理解：system prompt 只需要描述一种委派模式，不需要区分同步/异步

**Trade-off：** Operator 任务通常秒级完成，异步模型意味着用户会看到"正在处理"→ 等通知 → "完成"两步，而非即时返回。但在秒级延迟下这几乎感知不到差异。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CozyBase Agent                           │
│                                                              │
│  LLM: 轻量模型 (Haiku / GPT-4o-mini)                       │
│  Session: CozyBaseSession (不绑定 APP)                       │
│  Tools: ~8 个高层工具                                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 直接工具                   委派工具                    │   │
│  │                                                       │   │
│  │ list_apps ─── AppManager   create_app ──┐            │   │
│  │ get_app_detail              develop_app ──┤ 全部异步  │   │
│  │ start_app                   operate_app ──┘            │   │
│  │ stop_app                                              │   │
│  │ delete_app                                            │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                          │                         │
│     AppManager              ┌──────┴──────┐                 │
│     (daemon 内部)           │             │                 │
│                          Builder       Operator             │
│                          Session       Session              │
│                          (per-app)     (per-app)            │
│                             │             │                 │
│                         MCP Tools    Operator Tools         │
│                         (30+)        (6+)                   │
└─────────────────────────────────────────────────────────────┘

事件流：
━━━━━━━

  异步任务委派 + 完成通知：

  CozyBase Agent 调用委派工具
    │
    ▼
  TaskRegistry.enqueue({ appSlug, target, instruction })
    │
    ├── 队列为空 → 立即执行 session.injectPrompt()
    └── 队列有任务 → 排队等待
    │
    ▼ (后台执行完成)
  Builder/Operator Session afterPrompt()
    │
    ▼
  EventBus.emit('task:completed', { taskId, appSlug, summary })
    │
    ├── TaskRegistry 推进队列 → 下一个任务开始执行
    │
    └── CozyBaseSession (订阅者)
         │ injectSystemNotification(...)
         ▼
       CozyBase Agent LLM → 回复用户
```

### 模块结构

```
packages/cozybase-agent/
├── src/
│   ├── tools/
│   │   ├── list-apps.ts          # 直接工具
│   │   ├── get-app-detail.ts
│   │   ├── start-app.ts
│   │   ├── stop-app.ts
│   │   ├── delete-app.ts
│   │   ├── create-app.ts         # 异步委派工具
│   │   ├── develop-app.ts        # 异步委派工具
│   │   └── operate-app.ts        # 异步委派工具
│   ├── prompt.ts                 # system prompt 构建
│   └── types.ts                  # 类型定义
└── package.json

packages/daemon/src/ai/cozybase/
├── session.ts                    # CozyBaseSession
├── session-manager.ts            # CozyBaseSessionManager
├── task-registry.ts              # 异步任务队列与调度
├── mcp-server.ts                 # CozyBase Agent 的 MCP server
└── config.ts                     # settings 读取与解析

packages/daemon/src/modules/settings/
└── cozybase-agent-config.ts      # CozyBase Agent 配置验证与解析
```

### 数据流示例

```
用户: "创建一个记账应用"
━━━━━━━━━━━━━━━━━━━━━

1. WebSocket → CozyBaseSession.handleMessage()
2. CozyBase Agent LLM → 调用 create_app({ idea: "记账应用" })
3. create_app 工具:
   a. POST /api/v1/apps/create-with-ai { idea: "记账应用" }
   b. daemon 创建 APP (slug: "ledger")
   c. daemon injectPrompt → Builder ChatSession("ledger") 开始工作
   d. TaskRegistry.register({ taskId: "task_001", appSlug: "ledger", type: "create" })
   e. 返回 { taskId: "task_001", appSlug: "ledger", status: "running" }
4. CozyBase Agent LLM → 回复 "正在创建记账应用，完成后会通知你。"
5. (后台) Builder Agent 完成构建
6. ChatSession.afterPrompt() → EventBus.emit('task:completed', ...)
7. CozyBaseSession 收到事件 → injectPrompt("[系统通知] ...")
8. CozyBase Agent LLM → 回复 "记账应用已创建完成，包含..."


用户: "我这个月花了多少钱？"
━━━━━━━━━━━━━━━━━━━━━━━━

1. WebSocket → CozyBaseSession.handleMessage()
2. CozyBase Agent LLM → 调用 operate_app({ app_name: "ledger", instruction: "查询本月总支出" })
3. operate_app 工具:
   a. TaskRegistry.enqueue({ appSlug: "ledger", target: "operator", instruction: "查询本月总支出" })
   b. 队列为空 → 立即执行 OperatorSession("ledger").injectPrompt(...)
   c. 返回 { taskId: "task_002", appSlug: "ledger", status: "running" }
4. CozyBase Agent LLM → 回复 "正在查询，稍等..."
5. (后台，秒级) Operator Agent → execute_sql → 完成
6. EventBus.emit('task:completed', { taskId: "task_002", summary: "本月总支出 3,850 元" })
7. CozyBaseSession → injectPrompt("[系统通知] 操作完成：本月总支出 3,850 元")
8. CozyBase Agent LLM → 回复 "你这个月花了 3,850 元。"


用户: "记一笔 200 元午餐" + "再记一笔 50 元咖啡"（快速连续发送）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 第一条 → operate_app("ledger", "记一笔 200 元午餐")
   → TaskRegistry enqueue → 队列为空 → 立即执行 → task_003(running)
2. 第二条 → operate_app("ledger", "记一笔 50 元咖啡")
   → TaskRegistry enqueue → 队列有 task_003 → 排队 → task_004(queued)
3. task_003 完成 → 通知 → TaskRegistry 自动执行 task_004
4. task_004 完成 → 通知
5. 用户收到两条通知："200 元午餐已记录" + "50 元咖啡已记录"
```

## Risks / Trade-offs

**[异步通知的 LLM 额外调用] → 接受成本**
每次异步任务完成通知都会触发一次 CozyBase Agent 的 LLM 调用（消化通知 + 回复用户）。用轻量模型可以将单次调用成本控制在很低的水平。

**[通知排队] → 简单队列**
如果多个异步任务几乎同时完成，通知需要排队。CozyBaseSession 维护一个通知队列，确保一次只注入一条通知（等前一条处理完再注入下一条）。

**[Operator session 不存在] → 自动创建**
如果用户说"帮我查记账本的数据"，但 Operator session 从未创建过，`operatorSessionManager.getOrCreate()` 会自动创建。前提是 APP 有 Stable 版本且运行中。如果 APP 未发布或已停止，工具应返回清晰的错误信息。

**[Builder 正忙] → 排队或拒绝**
如果 Builder session 正在处理一个任务（`injectPrompt` 会检查 `this.streaming`），新的 `develop_app` 调用会失败。CozyBase Agent 应告知用户"该应用的开发任务正在进行中，请等待完成或取消当前任务"。

**[TaskRegistry 内存丢失] → daemon 重启后仍可恢复**
TaskRegistry 不持久化，daemon 重启后进行中的任务信息丢失。但 Builder session 的 snapshot 仍然持久化在 SQLite 中。用户可以通过 `develop_app` 重新触发。

**[System Prompt 长度] → 动态摘要**
如果 `list_apps` 返回大量 APP（比如 50 个），工具结果会很长。工具实现应限制返回字段（只返回 slug、displayName、status），详细信息通过 `get_app_detail` 按需获取。

## Open Questions

1. **委派工具的结果摘要如何生成？** Builder Agent 完成后，需要一段摘要文字传给 CozyBase Agent。可以取 Builder 的最后一条 assistant message，但这条消息可能很长（包含代码细节）。可能需要一个额外的 LLM 调用来生成摘要，或者在 Builder 的 system prompt 中要求它在最后一条消息中提供简明摘要。

2. **CozyBase Agent 如何知道用户想操作哪个 APP？** 当用户说"帮我记一笔"时，Agent 需要知道这是在使用"记账本"APP。可以在 system prompt 中告知 Agent 先调用 `list_apps`，然后根据描述匹配。也可以利用对话历史上下文（上一轮提到了记账本）。

3. **是否需要 `check_task` 工具？** 让 CozyBase Agent 主动查询异步任务进度。如果用户问"记账本做好了吗？"，Agent 可以调用 `check_task(taskId)` 查看状态。这个工具的必要性取决于 EventBus 通知是否足够及时。

4. **`develop_app` 触发的 Builder session 是否使用 `injectPrompt`？** 如果 Builder session 此前从未激活过（新 APP 刚通过 `create-with-ai` 创建完毕），`injectPrompt` 可以工作。但如果该 session 已有历史上下文，注入新 prompt 会接在历史之后。这通常是期望行为（Agent 理解之前做了什么），但如果历史上下文和新指令不连贯，可能导致困惑。
