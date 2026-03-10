# CozyBase Agent

## Purpose

定义 CozyBase Agent 作为平台级 AI 助手的会话模型、工具能力、异步委派流程、配置方式与历史持久化要求。

## Requirements

### Requirement: CozyBaseSession 不绑定 APP

CozyBase Agent 的会话实现 SHALL 是独立的 session 类，MUST NOT 继承 `RuntimeAgentSession`。CozyBaseSession SHALL 直接使用 `packages/ai-runtime` 的 `AgentRuntimeProvider.createQuery()` 创建 agent 查询，自行管理 session 生命周期。CozyBaseSession MUST NOT 持有 `appSlug` 属性，MUST NOT 注册 per-app 的 MCP server。

#### Scenario: CozyBaseSession 独立于 APP 创建

- **WHEN** `CozyBaseSessionManager.getOrCreate()` 被调用
- **THEN** SHALL 返回一个 `CozyBaseSession` 实例
- **AND** 该实例 MUST NOT 关联任何 `appSlug`
- **AND** 该实例 SHALL 通过 `AgentRuntimeProvider.createQuery()` 驱动 LLM 查询

#### Scenario: CozyBaseSession 不继承 RuntimeAgentSession

- **WHEN** CozyBaseSession 被实例化
- **THEN** 该实例 MUST NOT 是 `RuntimeAgentSession` 的子类
- **AND** SHALL 自行实现 WebSocket 连接管理、streaming 状态追踪和 event buffer 逻辑

### Requirement: CozyBaseSessionManager 单例管理

系统 SHALL 提供 `CozyBaseSessionManager`，在单用户场景下管理唯一的 `CozyBaseSession` 实例。`getOrCreate()` SHALL 延迟创建并复用同一实例。

#### Scenario: 首次调用 getOrCreate 创建实例

- **WHEN** `CozyBaseSessionManager.getOrCreate()` 首次被调用
- **THEN** SHALL 创建一个新的 `CozyBaseSession` 实例并返回

#### Scenario: 后续调用复用已有实例

- **WHEN** `CozyBaseSessionManager.getOrCreate()` 再次被调用
- **THEN** SHALL 返回之前创建的同一个 `CozyBaseSession` 实例

### Requirement: CozyBase Agent WebSocket 端点不绑定 APP

系统 SHALL 提供 `/api/v1/cozybase/ws` WebSocket 端点，MUST NOT 要求 `app` query 参数。该端点 SHALL 将连接路由到 `CozyBaseSessionManager` 管理的 session。

#### Scenario: 无 APP 参数的连接建立成功

- **WHEN** 客户端连接 `/api/v1/cozybase/ws`
- **THEN** 系统 SHALL 通过 `cozybaseSessionManager.getOrCreate()` 获取 session
- **AND** SHALL 将该 WebSocket 连接绑定到 CozyBaseSession
- **AND** session SHALL 向客户端推送 `session.connected` 事件

#### Scenario: 连接建立后可收发消息

- **WHEN** 客户端通过 `/api/v1/cozybase/ws` 建立连接
- **AND** 客户端发送 `{ type: 'chat:send', message: string }` 消息
- **THEN** CozyBaseSession SHALL 接收该消息并触发 Agent 查询
- **AND** Agent 产生的 `conversation.*` 事件 SHALL 通过该 WebSocket 推送给客户端

### Requirement: CozyBase Agent 直接工具集

CozyBase Agent SHALL 拥有以下直接工具，通过 daemon 内部 API 执行。每个工具 SHALL 定义标准的 MCP tool schema。

| 工具 | 描述 |
|------|------|
| `list_apps` | 列出所有 APP 及其状态 |
| `get_app_detail` | 获取某个 APP 的详细信息 |
| `start_app` | 启动 APP 的 Stable 运行时 |
| `stop_app` | 停止 APP 的 Stable 运行时 |
| `delete_app` | 删除 APP |

#### Scenario: list_apps 返回所有 APP 摘要

- **WHEN** Agent 调用 `list_apps` 工具
- **THEN** 工具 SHALL 返回所有已创建 APP 的列表
- **AND** 每个 APP 的返回字段 SHALL 限制为 slug、displayName 和 status
- **AND** MUST NOT 返回完整的 schema 或页面详情

#### Scenario: get_app_detail 返回指定 APP 详情

- **WHEN** Agent 调用 `get_app_detail({ app_name: "ledger" })`
- **THEN** 工具 SHALL 返回 `ledger` 的详细信息，包含状态、版本、页面列表和 function 列表

#### Scenario: start_app 启动 Stable 运行时

- **WHEN** Agent 调用 `start_app({ app_name: "ledger" })`
- **AND** APP `ledger` 有已发布的 Stable 版本
- **THEN** 工具 SHALL 启动 `ledger` 的 Stable 运行时
- **AND** SHALL 返回启动结果

#### Scenario: stop_app 停止 Stable 运行时

- **WHEN** Agent 调用 `stop_app({ app_name: "ledger" })`
- **AND** APP `ledger` 的 Stable 运行时正在运行
- **THEN** 工具 SHALL 停止 `ledger` 的 Stable 运行时

#### Scenario: delete_app 删除 APP

- **WHEN** Agent 调用 `delete_app({ app_name: "ledger" })`
- **THEN** 工具 SHALL 删除 APP `ledger`
- **AND** 关联的 Builder 和 Operator session SHALL 被清理

#### Scenario: 直接工具对不存在的 APP 返回错误

- **WHEN** Agent 调用 `get_app_detail({ app_name: "nonexistent" })`
- **AND** APP `nonexistent` 不存在
- **THEN** 工具 SHALL 返回清晰的错误信息，说明该 APP 不存在

### Requirement: 委派工具统一异步模型

CozyBase Agent SHALL 拥有三个委派工具：`create_app`、`develop_app`、`operate_app`。所有委派工具 SHALL 采用统一的异步模型，将任务入队 TaskRegistry 后立即返回 `{ taskId, appSlug, status }` 格式的结果。任务 SHALL 在后台由目标 Builder/Operator session 执行。

#### Scenario: create_app 异步创建 APP

- **WHEN** Agent 调用 `create_app({ idea: "记账应用" })`
- **THEN** 工具 SHALL 创建 APP 并获得 slug
- **AND** SHALL 将构建任务入队 TaskRegistry
- **AND** SHALL 立即返回 `{ taskId: string, appSlug: string, status: "queued" | "running" }`
- **AND** Builder session SHALL 在后台执行构建

#### Scenario: develop_app 异步委派开发

- **WHEN** Agent 调用 `develop_app({ app_name: "ledger", instruction: "加一个报表页面" })`
- **THEN** 工具 SHALL 将开发任务入队 TaskRegistry
- **AND** SHALL 立即返回 `{ taskId: string, appSlug: string, status: "queued" | "running" }`

#### Scenario: operate_app 异步委派数据操作

- **WHEN** Agent 调用 `operate_app({ app_name: "ledger", instruction: "查询本月总支出" })`
- **THEN** 工具 SHALL 将操作任务入队 TaskRegistry
- **AND** SHALL 立即返回 `{ taskId: string, appSlug: string, status: "queued" | "running" }`

#### Scenario: 委派工具对未发布 APP 的 operate_app 返回错误

- **WHEN** Agent 调用 `operate_app({ app_name: "draft-only-app", instruction: "查询数据" })`
- **AND** APP `draft-only-app` 没有已发布的 Stable 版本
- **THEN** 工具 SHALL 返回清晰的错误信息，说明该 APP 未发布或未运行

### Requirement: TaskRegistry 管理异步任务队列

系统 SHALL 提供 `TaskRegistry`，管理 CozyBase Agent 发起的异步委派任务。TaskRegistry SHALL 维护 per-app、per-target 的任务队列，以 `"{appSlug}:{target}"` 作为队列 key。同一队列内的任务 SHALL 串行执行。不同队列的任务 SHALL 可以并行。TaskRegistry SHALL 在内存中维护，daemon 重启后任务状态丢失。

#### Scenario: 任务入队后队列为空时立即执行

- **WHEN** TaskRegistry 收到第一个任务 `{ appSlug: "ledger", target: "builder", instruction: "..." }`
- **AND** `"ledger:builder"` 队列为空
- **THEN** 该任务 SHALL 立即进入 `running` 状态
- **AND** SHALL 触发目标 session 的 `injectPrompt()` 执行

#### Scenario: 任务入队后队列有运行中任务时排队

- **WHEN** TaskRegistry 收到新任务
- **AND** 同一队列已有 `running` 状态的任务
- **THEN** 新任务 SHALL 进入 `queued` 状态

#### Scenario: 同一 APP 的 builder 和 operator 队列独立

- **WHEN** `"ledger:builder"` 队列有 running 任务
- **AND** 新任务入队到 `"ledger:operator"` 队列
- **THEN** operator 队列的任务 SHALL 不受 builder 队列影响
- **AND** 如果 operator 队列为空，新任务 SHALL 立即执行

#### Scenario: 当前任务完成后自动推进队列

- **WHEN** `"ledger:builder"` 队列的当前 running 任务标记为 completed
- **AND** 队列中还有 queued 状态的任务
- **THEN** TaskRegistry SHALL 自动将下一个 queued 任务切换为 running
- **AND** SHALL 触发该任务的 `injectPrompt()` 执行

#### Scenario: 任务状态查询

- **WHEN** 通过 taskId 查询任务状态
- **THEN** TaskRegistry SHALL 返回完整的 `DelegatedTask` 信息，包含 status、appSlug、type、summary 等字段

### Requirement: 异步任务完成通知注入对话流

CozyBaseSession SHALL 订阅 EventBus 的 `task:completed` 和 `task:failed` 事件。收到事件后 SHALL 通过 `injectPrompt()` 向 Agent 对话流注入一条 `[系统通知]` 消息，触发 LLM 将结果告知用户。

#### Scenario: 任务完成后注入通知

- **WHEN** EventBus 发布 `task:completed` 事件，包含 `{ taskId, appSlug, summary }`
- **THEN** CozyBaseSession SHALL 调用 `injectPrompt()` 注入通知消息
- **AND** 注入的消息 SHALL 包含 `[系统通知]` 前缀和任务摘要
- **AND** SHALL 包含“请将此结果告知用户”的指令

#### Scenario: 任务失败后注入通知

- **WHEN** EventBus 发布 `task:failed` 事件，包含 `{ taskId, appSlug, error }`
- **THEN** CozyBaseSession SHALL 注入包含失败原因的通知消息

#### Scenario: Agent 正在处理 prompt 时通知排队

- **WHEN** CozyBaseSession 正在处理用户 prompt
- **AND** 此时收到 `task:completed` 事件
- **THEN** 该通知 SHALL 进入通知队列
- **AND** SHALL 在当前 prompt 处理完毕后再注入

#### Scenario: 多个通知顺序注入

- **WHEN** 通知队列中积累了多条待注入的通知
- **THEN** CozyBaseSession SHALL 逐条注入
- **AND** 每条通知的 LLM 处理完毕后再注入下一条

### Requirement: System Prompt 包含工具使用指引

CozyBase Agent 的 system prompt SHALL 在 session 创建时构建，包含 Agent 的角色定位、直接工具说明、委派工具说明、异步任务行为说明和交互规范。

#### Scenario: System prompt 包含完整的工具指引

- **WHEN** CozyBaseSession 创建并初始化 Agent
- **THEN** system prompt SHALL 描述 Agent 为“CozyBase Agent，Cozybase 平台的核心 AI 助手”
- **AND** SHALL 列出所有直接工具及其用途
- **AND** SHALL 列出所有委派工具及其异步行为
- **AND** SHALL 说明 `[系统通知]` 消息的含义和处理方式

#### Scenario: System prompt 指导 APP 识别策略

- **WHEN** system prompt 被构建
- **THEN** SHALL 包含指引，要求 Agent 在操作具体 APP 前先调用 `list_apps` 了解现有应用
- **AND** SHALL 指导 Agent 根据上下文推断目标 APP

### Requirement: LLM 配置通过 platform_settings 表管理

CozyBase Agent 的 LLM provider 和 model 配置 SHALL 通过 `platform_settings` 表存储，使用以下 key：
- `cozybase_agent.agent_provider`
- `cozybase_agent.model_provider`
- `cozybase_agent.model`

配置解析 SHALL 采用三级 fallback：存储值 → 环境变量 → 默认值。

#### Scenario: 通过 API 读取配置

- **WHEN** 客户端发送 `GET /api/v1/settings/cozybase-agent`
- **THEN** 系统 SHALL 返回当前的 agent_provider、model_provider 和 model 配置

#### Scenario: 通过 API 更新配置

- **WHEN** 客户端发送 `PUT /api/v1/settings/cozybase-agent` 包含新的配置
- **THEN** 系统 SHALL 将配置写入 `platform_settings` 表
- **AND** 后续创建的 CozyBaseSession SHALL 使用新配置

#### Scenario: 配置 fallback 到环境变量

- **WHEN** `platform_settings` 表中无 `cozybase_agent.agent_provider` 记录
- **AND** 环境变量 `COZYBASE_AGENT_PROVIDER` 设置为 `codex`
- **THEN** 系统 SHALL 使用 `codex` 作为 agent_provider

#### Scenario: 配置 fallback 到默认值

- **WHEN** `platform_settings` 表中无配置
- **AND** 无相关环境变量
- **THEN** 系统 SHALL 使用默认值：`agent_provider=claude-code`，`model=claude-sonnet-4-6`

### Requirement: 消息历史独立持久化

CozyBaseSession 的消息历史 SHALL 独立持久化到 `RuntimeSessionStore`，使用 `usage_type='cozybase'`、`app_slug='__cozybase__'`。该历史 MUST NOT 与任何 per-app Builder/Operator session 共享。

#### Scenario: 消息持久化到独立的存储空间

- **WHEN** CozyBase Agent 完成一轮对话
- **THEN** 该对话 SHALL 持久化到 `RuntimeSessionStore`
- **AND** 存储记录的 `usage_type` SHALL 为 `'cozybase'`
- **AND** 存储记录的 `app_slug` SHALL 为 `'__cozybase__'`

#### Scenario: 重连后恢复历史

- **WHEN** 客户端重新连接到 `/api/v1/cozybase/ws`
- **AND** 之前已有对话历史
- **THEN** CozyBaseSession SHALL 从 `RuntimeSessionStore` 恢复历史
- **AND** 通过 `session.history` 事件推送给客户端

#### Scenario: 历史与 per-app session 隔离

- **WHEN** CozyBase Agent 的对话历史被查询
- **THEN** 结果 MUST NOT 包含任何 per-app Builder 或 Operator session 的消息
