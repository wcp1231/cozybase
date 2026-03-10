## ADDED Requirements

### Requirement: Cozybase SHALL 提供 ACP stdio Agent 入口

Cozybase SHALL 提供一个可被 ACP Client 以 stdio 方式启动的 Agent 入口命令 `cozybase acp`。该命令 SHALL 作为独立进程运行，通过 newline-delimited JSON 的 JSON-RPC 2.0 消息处理 ACP 请求，并通过 WebSocket 连接已运行的 daemon。

#### Scenario: ACP Client 启动 `cozybase acp`

- **WHEN** ACP Client 以子进程方式执行 `cozybase acp --workspace ~/.cozybase`
- **THEN** Cozybase SHALL 启动一个独立的 ACP Agent 进程
- **AND** 该进程 SHALL 从 stdin 读取 ACP JSON-RPC 请求
- **AND** 该进程 SHALL 将 ACP 响应和通知写入 stdout

#### Scenario: daemon 不可用时返回清晰错误

- **WHEN** `cozybase acp` 启动时无法发现或连接 daemon
- **THEN** ACP Agent 入口 SHALL 返回标准错误响应
- **AND** 错误信息 SHALL 明确指出 daemon 不可用

### Requirement: ACP session SHALL 桥接到 CozyBase Agent WebSocket

ACP Server SHALL 将 ACP session 桥接到 daemon 的 `/api/v1/cozybase/ws` 端点，而不是桥接到 per-app 的 Builder 或 Operator WebSocket。ACP 层 MUST NOT 自己实现 APP 路由逻辑。

#### Scenario: 新建 ACP session 时连接 CozyBase Agent

- **WHEN** ACP Client 调用 `session/new`
- **THEN** ACP Server SHALL 建立到 `/api/v1/cozybase/ws` 的 WebSocket 连接
- **AND** SHALL 为该 ACP session 返回唯一的 `sessionId`
- **AND** 后续该 session 的 prompt 和 cancel 请求 SHALL 路由到这条 WebSocket 连接

#### Scenario: ACP session 不要求 APP 标识

- **WHEN** ACP Client 创建 session 或发送 prompt
- **THEN** ACP Server MUST NOT 要求调用方提供 `appSlug`
- **AND** CozyBase Agent SHALL 负责后续的意图理解和 APP 路由

### Requirement: ACP Server SHALL 支持 initialize 与能力声明

ACP Server SHALL 支持 ACP 的 `initialize` 请求，并在初始化响应中声明自身支持的核心会话能力。Phase 1 MUST NOT 宣称支持未实现的 `session/load`、`session/request_permission`、`fs/*` 或 `terminal/*` 能力。

#### Scenario: initialize 返回 Agent 能力声明

- **WHEN** ACP Client 发送 `initialize`
- **THEN** ACP Server SHALL 返回兼容的协议版本和 Agent 能力声明
- **AND** 响应 MUST NOT 宣称支持 `session/load`
- **AND** 响应 MUST NOT 宣称支持 `session/request_permission`

### Requirement: ACP Server SHALL 支持 session/prompt 请求

ACP Server SHALL 支持 ACP 的 `session/prompt` 请求，并将 prompt 文本桥接为 CozyBase Agent WebSocket 的入站消息。ACP Server SHALL 在同一 prompt 处理中持续接收 CozyBase Agent 的事件流，并转换为 ACP `session/update` 通知，直到该轮对话结束。

#### Scenario: prompt 文本转发到 CozyBase Agent

- **WHEN** ACP Client 对某个 session 调用 `session/prompt`
- **AND** prompt 内容包含文本输入
- **THEN** ACP Server SHALL 将其转换为 CozyBase Agent 可接受的 WebSocket 消息
- **AND** SHALL 通过对应 session 的 WebSocket 发送给 `/api/v1/cozybase/ws`

#### Scenario: prompt 完成后返回结束结果

- **WHEN** CozyBase Agent 完成一轮查询
- **AND** WebSocket 收到 `conversation.run.completed`
- **THEN** ACP Server SHALL 结束当前 `session/prompt` 调用
- **AND** SHALL 返回表示正常结束的 prompt result

#### Scenario: prompt 执行出错时返回错误

- **WHEN** CozyBase Agent 返回 `conversation.error` 或 `session.error`
- **THEN** ACP Server SHALL 结束当前 `session/prompt` 调用
- **AND** SHALL 向 ACP Client 返回错误结果

### Requirement: ACP Server SHALL 支持 session/cancel 请求

ACP Server SHALL 支持 ACP 的 `session/cancel` 请求，并将取消动作桥接为 CozyBase Agent WebSocket 的取消消息。

#### Scenario: session/cancel 转发为 WebSocket cancel

- **WHEN** ACP Client 对某个活跃 session 调用 `session/cancel`
- **THEN** ACP Server SHALL 向对应 WebSocket 发送取消消息
- **AND** 当前活跃 prompt SHALL 结束

#### Scenario: 取消不存在的活跃 prompt

- **WHEN** ACP Client 调用 `session/cancel`
- **AND** 该 session 当前没有活跃 prompt
- **THEN** ACP Server SHALL 返回清晰错误

### Requirement: CozyBase Agent 事件流 SHALL 映射为 ACP session/update

ACP Server SHALL 将 CozyBase Agent 的 `conversation.*` 事件映射为 ACP `session/update` 通知，使 ACP Client 能看到 Agent 文本输出、工具调用进度和系统通知。映射 MUST 保留消息与工具调用的关联标识。

#### Scenario: assistant 文本流映射为 agent message update

- **WHEN** WebSocket 收到 `conversation.message.started`、`conversation.message.delta` 和 `conversation.message.completed`
- **THEN** ACP Server SHALL 将这些事件映射为同一条 Agent 消息的流式 `session/update` 通知
- **AND** SHALL 保留消息关联标识

#### Scenario: tool 调用映射为 ACP tool update

- **WHEN** WebSocket 收到 `conversation.tool.started`、`conversation.tool.progress` 或 `conversation.tool.completed`
- **THEN** ACP Server SHALL 发送对应的 ACP `session/update` 通知
- **AND** SHALL 保留 `toolUseId` 与工具名
- **AND** 工具完成通知 SHALL 包含工具结果摘要

#### Scenario: conversation.notice 映射为可见通知

- **WHEN** WebSocket 收到 `conversation.notice`
- **THEN** ACP Server SHALL 将其映射为 ACP 可见的 Agent 更新
- **AND** ACP Client SHALL 能向用户展示该通知内容

### Requirement: ACP session 生命周期 SHALL 与 WebSocket 状态保持一致

ACP Server SHALL 跟踪每个 ACP session 的 WebSocket 连接状态。当底层 WebSocket 断开或不可用时，ACP Server MUST NOT 静默丢弃 prompt 请求。

#### Scenario: WebSocket 断开后拒绝新 prompt

- **WHEN** 某个 ACP session 对应的 WebSocket 已断开
- **AND** ACP Client 再次发送 `session/prompt`
- **THEN** ACP Server SHALL 返回清晰错误
- **AND** MUST NOT 假装 prompt 已成功开始

#### Scenario: session 创建后可持续复用同一连接

- **WHEN** ACP Client 对同一个 session 连续发送多次 `session/prompt`
- **THEN** ACP Server SHALL 复用该 session 已建立的 WebSocket 连接
- **AND** 后续 prompt SHALL 共享 CozyBase Agent 的会话上下文

### Requirement: OpenClaw 集成配置 SHALL 可文档化注册

Cozybase SHALL 提供一份明确的集成说明，使 OpenClaw 的 `acpx` 插件可以将 Cozybase 注册为自定义 ACP Agent。

#### Scenario: 提供 acpx 自定义 Agent 注册命令

- **WHEN** 用户查阅 Cozybase 的 ACP 集成说明
- **THEN** 文档 SHALL 给出 `~/.acpx/config.json` 的示例配置
- **AND** 示例中 SHALL 使用 `cozybase acp` 作为 Agent 启动命令
