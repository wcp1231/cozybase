## ADDED Requirements

### Requirement: Operator Agent 独立 package 结构

`packages/operator-agent` SHALL 作为独立 package 存在，封装 Operator Agent 的核心逻辑，包括 tool 定义、system prompt 构建和类型导出。

- 该 package 的公开 API SHALL 保持 provider-neutral，不以某个具体 runtime provider 作为中心
- 该 package MAY 保留 `pi-agent-core` / `pi-ai` 相关依赖以支持兼容性的 native adapter
- Tool 的参数 schema SHALL 使用 `@sinclair/typebox` 定义
- 该 package SHALL 导出 tool 工厂函数、prompt builder 和公共类型，供 daemon 使用
- 该 package MUST NOT 直接依赖 daemon 或 runtime 的内部模块

#### Scenario: package 可独立构建

- **WHEN** 在 `packages/operator-agent` 目录下执行构建
- **THEN** 该 package SHALL 成功编译，不依赖 daemon 或 runtime 的源码

#### Scenario: daemon 引用 operator package

- **WHEN** daemon 的 `OperatorSession` 模块需要创建 Operator Agent
- **THEN** daemon SHALL 从 `packages/operator-agent` 导入 tool 工厂函数和 prompt builder

### Requirement: Operator Agent SHALL 暴露 provider-neutral action 定义及多种 adapter

`packages/operator-agent` SHALL 将 Operator usage 的动作定义与 provider-specific tool protocol 适配解耦。

- 同一组 Operator action SHALL 至少包含：`list_tables`、`query_data`、`create_record`、`update_record`、`delete_record`、`call_function`
- `packages/operator-agent` SHALL 同时提供：
  - 适用于 `pi-agent-core` 的 native tool adapter
  - 适用于 `codex` / `claude-code` 的 MCP tool adapter 或 MCP server registration path
- 两类 adapter SHALL 复用同一套 action 描述、参数 schema 和执行后端，不得复制分叉业务逻辑

#### Scenario: native adapter 复用同一组 action

- **WHEN** `operator.agent_provider = 'pi-agent-core'`
- **THEN** daemon SHALL 从 `packages/operator-agent` 获取 native tool adapter
- **AND** 这些 native tools SHALL 复用与 MCP adapter 相同的 action 定义

#### Scenario: MCP adapter 复用同一组 action

- **WHEN** `operator.agent_provider = 'codex'` 或 `operator.agent_provider = 'claude-code'`
- **THEN** daemon SHALL 从 `packages/operator-agent` 获取 MCP adapter
- **AND** 暴露给模型的 action 集合 SHALL 与 native adapter 保持语义一致

### Requirement: OperatorSession 封装 per-app Agent 实例

daemon SHALL 提供 `OperatorSession` 类，为每个 APP 封装一个 `packages/ai-runtime` 的 `AgentRuntimeSession` 实例。

- 每个 `OperatorSession` SHALL 与一个 `appSlug` 一一对应
- `OperatorSession` 创建时 SHALL 通过 prompt builder 动态构建包含 APP schema 和可用 functions 的 system prompt
- `OperatorSession` SHALL 根据所选 runtime provider 的 capability 选择合适的 `toolMode`
- `OperatorSession` SHALL 通过 runtime session 的事件流监听并转发给前端

#### Scenario: 创建 OperatorSession

- **WHEN** 用户首次进入某个 APP 的 Operator 聊天
- **THEN** daemon SHALL 创建一个新的 `OperatorSession`，包含该 APP 的动态 system prompt 和 tool 集合
- **AND** Agent 的 runtime provider 与 model 参数 SHALL 读取自用户的 Operator 配置

#### Scenario: 恢复已有 OperatorSession

- **WHEN** 用户再次进入某个 APP 的 Operator 聊天且该 APP 已有持久化的 session
- **THEN** daemon SHALL 从持久化存储中加载消息历史
- **AND** 通过 runtime provider 的 snapshot / restore 机制恢复 Agent 的对话上下文

#### Scenario: 用户发送消息

- **WHEN** 用户通过 WebSocket 发送文本消息到 OperatorSession
- **THEN** OperatorSession SHALL 调用 runtime session 的 `prompt(message)`
- **AND** 通过 Agent 的事件流将 assistant 回复、tool 执行过程实时推送给前端

### Requirement: Operator runtime provider SHALL 决定 tool transport

daemon SHALL 根据选中的 Operator runtime provider 决定使用 native tools 还是 MCP tools；Operator usage 自身不直接绑定某一种 transport。

- `pi-agent-core` SHALL 使用 `toolMode: 'native'`
- `codex` 和 `claude-code` SHALL 使用 `toolMode: 'mcp'`
- daemon SHALL 在创建 session 前校验所选 provider 支持 Operator 所需的 tool mode
- 不支持的组合 SHALL 以明确错误返回，而不是隐式 fallback

#### Scenario: pi-agent-core 走 native tool mode

- **WHEN** `operator.agent_provider = 'pi-agent-core'`
- **THEN** daemon SHALL 创建 `toolMode: 'native'` 的 runtime session
- **AND** 将 Operator native tools 注入该 session

#### Scenario: codex 走 MCP tool mode

- **WHEN** `operator.agent_provider = 'codex'`
- **THEN** daemon SHALL 创建 `toolMode: 'mcp'` 的 runtime session
- **AND** 为该 session 注入 Operator MCP server / MCP config

#### Scenario: claude-code 走 MCP tool mode

- **WHEN** `operator.agent_provider = 'claude-code'`
- **THEN** daemon SHALL 创建 `toolMode: 'mcp'` 的 runtime session
- **AND** 为该 session 注入 Operator MCP server / MCP config

#### Scenario: provider 不支持所需 tool mode

- **WHEN** 用户为 Operator 配置了不支持 `native` 或 `mcp` 的 runtime provider
- **THEN** daemon SHALL 发送明确的 `session.error`
- **AND** 关闭该 WebSocket 连接

### Requirement: OperatorSessionManager 管理所有 APP 的 Operator 会话

daemon SHALL 提供 `OperatorSessionManager`，负责 OperatorSession 的创建、获取、销毁和持久化。

- `OperatorSessionManager` SHALL 维护一个 `Map<appSlug, OperatorSession>` 内存映射
- 当请求的 `appSlug` 不在内存中时，SHALL 尝试从持久化存储加载
- 当 APP 被删除时，对应的 OperatorSession 和持久化数据 SHALL 被一并清除

#### Scenario: getOrCreate 获取已有 session

- **WHEN** 调用 `getOrCreate(appSlug)` 且该 APP 已有活跃的 OperatorSession
- **THEN** SHALL 直接返回内存中的 OperatorSession 实例

#### Scenario: getOrCreate 从持久化恢复

- **WHEN** 调用 `getOrCreate(appSlug)` 且内存中没有该 APP 的 session，但持久化存储中有记录
- **THEN** SHALL 创建新的 `OperatorSession` 并从持久化记录中恢复消息历史

#### Scenario: getOrCreate 创建全新 session

- **WHEN** 调用 `getOrCreate(appSlug)` 且内存和持久化存储中都没有该 APP 的记录
- **THEN** SHALL 创建一个空消息历史的新 `OperatorSession`

#### Scenario: APP 删除时清理 session

- **WHEN** 某个 APP 被删除
- **THEN** OperatorSessionManager SHALL 销毁对应的 OperatorSession
- **AND** 删除该 APP 的持久化 session 数据

### Requirement: Operator Tools 面向 Stable APP REST API

`packages/operator-agent` SHALL 提供以下 AgentTool 定义，每个 tool 通过调用 Stable APP 的 REST API 执行操作。

tool 工厂函数 SHALL 接受一个 `callApi` 回调参数，由 daemon 在创建 OperatorSession 时注入实际的 API 调用实现。

| Tool 名称 | 用途 | 对应 REST API |
|-----------|------|--------------|
| `list_tables` | 列出 APP 的所有数据表及其列定义 | `GET /fn/_db/schemas` |
| `query_data` | 查询某张表的数据 | `GET /fn/_db/tables/{table}` |
| `create_record` | 在某张表中创建记录 | `POST /fn/_db/tables/{table}` |
| `update_record` | 更新某张表中的记录 | `PATCH /fn/_db/tables/{table}/{id}` |
| `delete_record` | 删除某张表中的记录 | `DELETE /fn/_db/tables/{table}/{id}` |
| `call_function` | 调用 APP 的自定义 function | `{method} /fn/{name}` |

- 所有 tool SHALL 固定使用 `stable` mode
- tool 执行失败时 SHALL throw Error，错误消息中 SHALL 包含 HTTP 状态码、错误原因，以及足以指导模型调整下一次调用的提示信息

#### Scenario: list_tables 返回表结构

- **WHEN** Agent 调用 `list_tables` tool
- **THEN** tool SHALL 请求 `GET /stable/apps/{appSlug}/fn/_db/schemas`
- **AND** 返回包含所有表名及列定义的结构化结果

#### Scenario: query_data 带过滤条件查询

- **WHEN** Agent 调用 `query_data` tool，参数为 `{ table: "allergens", where: "severity=eq.高", limit: 10 }`
- **THEN** tool SHALL 请求 `GET /stable/apps/{appSlug}/fn/_db/tables/allergens?where=severity%3Deq.高&limit=10`
- **AND** 返回匹配的记录列表

#### Scenario: create_record 创建一条数据

- **WHEN** Agent 调用 `create_record` tool，参数为 `{ table: "allergens", data: { name: "花生", severity: "高" } }`
- **THEN** tool SHALL 请求 `POST /stable/apps/{appSlug}/fn/_db/tables/allergens`，body 为 `{ "name": "花生", "severity": "高" }`
- **AND** 返回创建成功的记录（含 id）

#### Scenario: update_record 更新一条数据

- **WHEN** Agent 调用 `update_record` tool，参数为 `{ table: "allergens", id: "1", data: { severity: "中" } }`
- **THEN** tool SHALL 请求 `PATCH /stable/apps/{appSlug}/fn/_db/tables/allergens/1`，body 为 `{ "severity": "中" }`
- **AND** 返回更新后的完整记录

#### Scenario: delete_record 删除一条数据

- **WHEN** Agent 调用 `delete_record` tool，参数为 `{ table: "allergens", id: "1" }`
- **THEN** tool SHALL 请求 `DELETE /stable/apps/{appSlug}/fn/_db/tables/allergens/1`
- **AND** 返回 `{ success: true }`

#### Scenario: call_function 调用自定义函数

- **WHEN** Agent 调用 `call_function` tool，参数为 `{ name: "adjust-inventory", method: "POST", body: { item: "卫生纸", delta: 5 } }`
- **THEN** tool SHALL 请求 `POST /stable/apps/{appSlug}/fn/adjust-inventory`，body 为 `{ "item": "卫生纸", "delta": 5 }`
- **AND** 返回函数的 HTTP 响应 status 和 body

#### Scenario: tool 执行失败

- **WHEN** Agent 调用 `create_record` 但 REST API 返回 HTTP 4xx/5xx
- **THEN** tool SHALL throw Error，消息中包含 HTTP 状态码、错误信息与可执行提示
- **AND** 所选 runtime provider SHALL 将该错误以标准 tool failure 结果报告给 LLM

### Requirement: 动态 System Prompt 构建

`packages/operator-agent` SHALL 提供 `buildOperatorSystemPrompt` 函数，在 OperatorSession 创建时从 APP 的运行时信息动态构建 system prompt。

prompt 内容 SHALL 包含：
1. APP 元数据（displayName、description）
2. 所有数据表的 schema（表名、列名、列类型、主键、非空约束）
3. 可用的自定义 function 列表

`buildOperatorSystemPrompt` SHALL 接受一个回调参数获取 schema 和 function 列表，不直接访问 APP 运行时。

#### Scenario: 根据 schema 构建 prompt

- **WHEN** 创建 OperatorSession 时调用 `buildOperatorSystemPrompt`
- **THEN** SHALL 从 `GET /fn/_db/schemas` 获取表结构
- **AND** prompt 中 SHALL 包含每张表的列名、类型、主键标识

#### Scenario: 包含自定义 function 列表

- **WHEN** APP 定义了自定义 functions（如 `mark-allergen.ts`、`adjust-inventory.ts`）
- **THEN** prompt 中 SHALL 列出这些 function 的访问路径（如 `POST /fn/mark-allergen`）

#### Scenario: APP 没有自定义 function

- **WHEN** APP 没有 functions 目录或 functions 为空
- **THEN** prompt 中 SHALL 省略自定义 function 部分，仅包含数据表结构

### Requirement: Operator Session SHALL 使用 runtime snapshot 持久化并投影历史

daemon SHALL 将 OperatorSession 的 provider-native snapshot 持久化到 platform 数据库，并在连接时统一投影为 `session.history`。

- 持久化 SHALL 使用共享的 `agent_runtime_sessions` 表，按 `(usage_type = 'operator', app_slug)` 存储
- 持久化内容 SHALL 包含 provider-native snapshot
- 历史恢复 SHALL 通过 runtime 层的 history projection 统一输出为 `StoredMessage[]`
- 当 APP 被删除时，对应的 Operator snapshot 记录 SHALL 被删除

#### Scenario: 对话结束后持久化 snapshot

- **WHEN** OperatorSession 完成一轮 prompt 处理
- **THEN** daemon SHALL 调用 runtime session 的 `exportSnapshot()`
- **AND** 将返回的 snapshot 写入 `agent_runtime_sessions`

#### Scenario: 连接时恢复标准化历史

- **WHEN** 用户重新连接某个已有 OperatorSession 的 APP
- **THEN** daemon SHALL 从 `agent_runtime_sessions` 读取该 APP 的 snapshot
- **AND** 将其投影为 `session.history` 所需的标准化消息数组

#### Scenario: APP 删除时清理 snapshot

- **WHEN** APP `allergen-tracker` 被删除
- **THEN** `agent_runtime_sessions` 表中 `(usage_type='operator', app_slug='allergen-tracker')` 的记录 SHALL 被删除

### Requirement: Builder 与 Operator SHALL 共享 runtime-backed session skeleton

daemon 内的 Builder 与 Operator session SHALL 共享同一套 runtime-backed session 生命周期模型。

- 两者 SHALL 共享 connect / reconnect / run buffer / interrupt / snapshot persist / history replay 骨架
- 两者的差异 SHALL 收敛到 prompt、context loader、tool / MCP config 组装
- provider-specific 差异 SHALL 收敛在 `packages/ai-runtime`

#### Scenario: reconnect 行为一致

- **WHEN** Builder 或 Operator 的浏览器连接在一轮对话过程中断开并重新连接
- **THEN** daemon SHALL 先发送 `session.connected`
- **AND** 发送 `session.history`
- **AND** 如该轮仍在进行中，则重放当前 run buffer

#### Scenario: provider 切换时清理不兼容 snapshot

- **WHEN** 某个 APP 的 Operator runtime provider 从 `codex` 切换到 `claude-code`
- **THEN** daemon SHALL 检测到旧 snapshot 的 providerKind 不兼容
- **AND** 清理旧 snapshot，而不是尝试跨 provider 恢复

### Requirement: Operator WebSocket 接入

daemon SHALL 提供独立的 WebSocket 端点供前端连接 Operator Agent。

- 端点路径 SHALL 为 `/api/v1/operator/ws?app={appSlug}`
- 连接建立后 daemon SHALL 通过 `OperatorSessionManager.getOrCreate(appSlug)` 获取或创建 session
- daemon SHALL 向前端发送事件，事件格式 SHALL 复用现有 `conversation.*` 和 `session.*` 事件体系
- 前端发送的消息格式 SHALL 为 `{ type: 'chat:send', message: string }`
- daemon MAY 继续兼容旧格式 `{ type: 'prompt', text: string }`

#### Scenario: 建立 Operator WebSocket 连接

- **WHEN** 前端请求 `ws://localhost:{port}/api/v1/operator/ws?app=allergen-tracker`
- **THEN** daemon SHALL 获取或创建 `allergen-tracker` 的 OperatorSession
- **AND** 向前端发送 `session.connected` 事件
- **AND** 如果有历史消息，发送 `session.history` 事件

#### Scenario: 前端发送用户消息

- **WHEN** 前端通过 WebSocket 发送 `{ type: 'chat:send', message: '把花生标记为过敏源' }`
- **THEN** daemon SHALL 调用 OperatorSession 的 `runtimeSession.prompt()` 方法
- **AND** 将标准化的 `conversation.*` 事件推送给前端

#### Scenario: APP 不存在

- **WHEN** 前端请求的 `appSlug` 对应的 APP 不存在或尚未 publish
- **THEN** daemon SHALL 返回错误事件并关闭 WebSocket 连接

### Requirement: runtime provider SHALL 向 usage 层暴露统一的 `conversation.*` 事件

`packages/ai-runtime` SHALL 将 provider-native 事件统一归一化为 `conversation.*`，使 Builder 与 Operator 都只消费同一套事件协议。

#### Scenario: provider 事件统一为 conversation.message.delta

- **WHEN** 任一 runtime provider 产生流式 assistant 文本增量
- **THEN** runtime 层 SHALL 向 daemon session 暴露 `conversation.message.delta`

#### Scenario: provider tool 执行统一为 conversation.tool 事件

- **WHEN** 任一 runtime provider 开始执行 Operator tool
- **THEN** runtime 层 SHALL 向 daemon session 暴露 `conversation.tool.started`，包含 `toolUseId` 和 `toolName`
