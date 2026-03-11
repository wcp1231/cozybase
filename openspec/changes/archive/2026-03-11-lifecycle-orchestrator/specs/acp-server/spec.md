## MODIFIED Requirements

### Requirement: ACP Server SHALL 支持 session/prompt 请求

ACP Server SHALL 支持 ACP 的 `session/prompt` 请求，并将 prompt 文本桥接为 CozyBase Agent WebSocket 的入站消息。ACP Server SHALL 将每次 prompt 绑定到 CozyBase session 的 lifecycle，而不是绑定到单次 `conversation.run.completed`。当前 prompt 只有在 lifecycle 结束时才可完成。

#### Scenario: 首个 prompt 创建新的 lifecycle

- **WHEN** ACP Client 对某个 session 调用 `session/prompt`
- **AND** CozyBase session 当前没有 active lifecycle
- **THEN** ACP Server SHALL 将该 prompt 作为新 lifecycle 的首个用户输入发送给 `/api/v1/cozybase/ws`
- **AND** SHALL 为当前 prompt 注册一个等待 lifecycle 结束的 waiter

#### Scenario: 后续 prompt 加入已有 lifecycle

- **WHEN** ACP Client 对某个 session 调用 `session/prompt`
- **AND** CozyBase session 当前已有 active lifecycle
- **THEN** ACP Server SHALL 将该 prompt 追加到当前 active lifecycle
- **AND** SHALL 为该 prompt 注册到同一个 lifecycle 的 waiter

#### Scenario: conversation 完成但 lifecycle 未结束

- **WHEN** CozyBase Agent 发出 `conversation.run.completed`
- **AND** 当前 lifecycle 仍有待处理事件或 pending tasks
- **THEN** ACP Server MUST NOT 结束当前 `session/prompt`

#### Scenario: lifecycle 完成后返回 prompt 结果

- **WHEN** CozyBase Agent 发出 `lifecycle.completed`
- **THEN** ACP Server SHALL 结束当前 lifecycle 上所有等待中的 `session/prompt`
- **AND** SHALL 返回表示正常结束的 prompt result

#### Scenario: lifecycle 失败时返回错误

- **WHEN** CozyBase Agent 发出 `lifecycle.failed`
- **THEN** ACP Server SHALL 结束当前 lifecycle 上所有等待中的 `session/prompt`
- **AND** SHALL 向 ACP Client 返回错误结果

### Requirement: CozyBase Agent 事件流 SHALL 映射为 ACP session/update

ACP Server SHALL 将 CozyBase Agent 的 `conversation.*` 事件映射为 ACP `session/update` 通知，使 ACP Client 能看到 Agent 文本输出、工具调用进度和系统通知。ACP Server SHALL 同时跟踪 `lifecycle.*` 事件，用于管理 prompt 收束边界。

#### Scenario: assistant 文本流映射为 agent message update

- **WHEN** WebSocket 收到 `conversation.message.started`、`conversation.message.delta` 和 `conversation.message.completed`
- **THEN** ACP Server SHALL 将这些事件映射为同一条 Agent 消息的流式 `session/update` 通知
- **AND** SHALL 保留消息关联标识

#### Scenario: tool 调用映射为 ACP tool update

- **WHEN** WebSocket 收到 `conversation.tool.started`、`conversation.tool.progress` 或 `conversation.tool.completed`
- **THEN** ACP Server SHALL 发送对应的 ACP `session/update` 通知
- **AND** SHALL 保留 `toolUseId` 与工具名
- **AND** 工具完成通知 SHALL 包含工具结果摘要

#### Scenario: lifecycle 事件驱动 prompt 收束

- **WHEN** WebSocket 收到 `lifecycle.completed` 或 `lifecycle.failed`
- **THEN** ACP Server SHALL 更新对应 lifecycle 的 waiter 状态
- **AND** SHALL 使用该事件而不是 `conversation.run.completed` 决定 prompt 是否结束

#### Scenario: conversation.notice 映射为可见通知

- **WHEN** WebSocket 收到 `conversation.notice`
- **THEN** ACP Server SHALL 将其映射为 ACP 可见的 Agent 更新
- **AND** ACP Client SHALL 能向用户展示该通知内容
