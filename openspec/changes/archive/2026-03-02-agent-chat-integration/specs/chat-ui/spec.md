## ADDED Requirements

### Requirement: Chat Window WebSocket 连接
Chat Panel SHALL 通过 WebSocket 连接到 `/api/v1/chat/ws`，实现与后端 ChatService 的双向通信。

连接 SHALL 在 Chat Panel 组件挂载时建立，在组件卸载时关闭。连接断开时 SHALL 自动重连。

#### Scenario: 组件挂载建立连接
- **WHEN** Chat Panel 组件挂载到 DOM
- **THEN** 自动建立到 `/api/v1/chat/ws` 的 WebSocket 连接

#### Scenario: 连接断开自动重连
- **WHEN** WebSocket 连接意外断开
- **THEN** Chat Panel SHALL 在延迟后自动尝试重连

### Requirement: 发送用户消息
用户 SHALL 能够在 Chat Panel 输入框中输入文本并发送给 Agent。

#### Scenario: 发送文本消息
- **WHEN** 用户在输入框中输入文本并点击发送（或按 Enter）
- **THEN** Chat Panel 通过 WebSocket 发送 `{ type: "chat:send", message: "用户输入内容" }` 消息
- **THEN** 输入框清空，用户消息立即显示在消息列表中

#### Scenario: Agent 执行中禁止发送
- **WHEN** Agent 正在处理上一条消息（未收到 `result` 消息）
- **THEN** 发送按钮 SHALL 置灰，输入框提示 "Agent 正在思考..."

### Requirement: 流式消息渲染
Chat Panel SHALL 根据收到的 `SDKMessage` 类型渲染不同的 UI 元素。

#### Scenario: 流式文本打字效果
- **WHEN** 收到 `stream_event` 类型消息（包含文本增量）
- **THEN** Chat Panel SHALL 将文本增量追加到当前 assistant 消息气泡中，实现打字效果

#### Scenario: 工具执行状态展示
- **WHEN** 收到 `tool_progress` 类型消息
- **THEN** Chat Panel SHALL 显示工具执行指示器，包含工具名称和执行耗时

#### Scenario: 工具摘要展示
- **WHEN** 收到 `tool_use_summary` 类型消息
- **THEN** Chat Panel SHALL 显示工具使用摘要文本

#### Scenario: 对话回合结束
- **WHEN** 收到 `result` 类型消息且 `subtype` 为 `success`
- **THEN** Chat Panel SHALL 标记当前回合结束，重新启用输入框

#### Scenario: Agent 错误
- **WHEN** 收到 `result` 类型消息且 `is_error` 为 `true`
- **THEN** Chat Panel SHALL 显示错误提示信息

### Requirement: 取消 Agent 执行
用户 SHALL 能够在 Agent 执行过程中取消当前操作。

#### Scenario: 取消正在执行的操作
- **WHEN** Agent 正在执行且用户点击取消按钮
- **THEN** Chat Panel 通过 WebSocket 发送 `{ type: "chat:cancel" }` 消息
- **THEN** 输入框重新启用
