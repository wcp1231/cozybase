## ADDED Requirements

### Requirement: 前端聊天 store 必须消费统一的 Agent 事件格式

前端聊天 store SHALL 处理 `conversation.*` 和 `session.*` 两类事件，MUST NOT 直接处理 Claude SDK 原始消息格式（`stream_event`、`assistant`、`tool_use_summary`、`result` 等）。store SHALL 通过 `messageId` 在本地消息列表中定位并更新消息，不依赖外部流式 buffer 变量。

#### Scenario: conversation.message.started 创建新的消息条目

- **WHEN** 前端收到 `{ type: 'conversation.message.started', messageId: 'm-1', role: 'assistant' }`
- **THEN** store SHALL 在消息列表末尾追加 `{ role: 'assistant', content: '' }` 并以 `messageId` 为 key 记录其 index
- **AND** 后续该 `messageId` 的 delta 事件 SHALL 更新该条目的内容

#### Scenario: conversation.message.delta 追加文本到对应消息

- **WHEN** 前端收到 `{ type: 'conversation.message.delta', messageId: 'm-1', role: 'assistant', delta: '你好' }`
- **THEN** store SHALL 找到 `messageId = 'm-1'` 对应的消息条目
- **AND** SHALL 将 `delta` 追加到该条目的 `content` 末尾
- **AND** MUST NOT 创建新的消息条目

#### Scenario: conversation.message.completed 替换消息为最终内容

- **WHEN** 前端收到 `{ type: 'conversation.message.completed', messageId: 'm-1', role: 'assistant', content: '你好，有什么需要帮忙的？' }`
- **THEN** store SHALL 找到 `messageId = 'm-1'` 对应的消息条目
- **AND** SHALL 将其 `content` 替换为事件中的完整文本
- **AND** MUST NOT 创建额外的消息条目

#### Scenario: conversation.tool.started 创建 running 状态的 tool 条目

- **WHEN** 前端收到 `{ type: 'conversation.tool.started', toolUseId: 'tu-1', toolName: 'fetch_app' }`
- **THEN** store SHALL 在消息列表末尾追加 `{ role: 'tool', toolName: 'fetch_app', status: 'running' }`
- **AND** 以 `toolUseId` 为 key 记录其 index

#### Scenario: conversation.tool.completed 将 tool 条目标记为 done

- **WHEN** 前端收到 `{ type: 'conversation.tool.completed', toolUseId: 'tu-1', toolName: 'fetch_app', summary: 'Fetched 12 files' }`
- **THEN** store SHALL 找到 `toolUseId = 'tu-1'` 对应的 tool 条目
- **AND** SHALL 将其 `status` 更新为 `'done'` 并设置 `summary`

#### Scenario: conversation.run.started 设置 streaming 状态为 true

- **WHEN** 前端收到 `{ type: 'conversation.run.started' }`
- **THEN** store SHALL 设置 `streaming = true`

#### Scenario: conversation.run.completed 设置 streaming 状态为 false

- **WHEN** 前端收到 `{ type: 'conversation.run.completed', sessionId: string }`
- **THEN** store SHALL 设置 `streaming = false`

#### Scenario: conversation.error 以错误形式展示

- **WHEN** 前端收到 `{ type: 'conversation.error', message: string }`
- **THEN** store SHALL 在消息列表末尾追加一条可展示错误内容的 assistant 消息
- **AND** store SHALL 设置 `streaming = false`

## MODIFIED Requirements

### Requirement: 前端必须处理按 APP 恢复的历史消息

前端聊天 store SHALL 识别 `session.history` 消息，并使用服务端返回的历史消息初始化当前 APP 的聊天记录。

#### Scenario: 建立连接后恢复历史记录

- **WHEN** 前端收到 `{ type: 'session.history', messages: StoredMessage[] }`
- **THEN** store SHALL 用 `messages` 初始化当前消息列表
- **AND** 后续新的 assistant 或 tool 消息 SHALL 追加到该列表之后

### Requirement: 前端聊天 store 必须按 activeApp 切换 Agent 连接

前端聊天 store SHALL 暴露 `activeApp` 状态和 `setActiveApp(appName | null)` 操作。`setActiveApp` 在 APP 变化时 SHALL 断开旧 WebSocket、清空本地消息，并根据新的 APP 重新建立或停止连接。连接建立后 store 的初始状态 SHALL 由 `session.connected` 事件提供。

#### Scenario: 切换到新的 APP 时重建连接

- **WHEN** 当前聊天 store 已连接 APP `orders`
- **AND** 页面切换并调用 `setActiveApp('inventory')`
- **THEN** store SHALL 先断开 `orders` 的 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store SHALL 建立新的 `/api/v1/chat/ws?app=inventory` 连接

#### Scenario: session.connected 恢复连接时的初始状态

- **WHEN** WebSocket 连接建立后收到 `{ type: 'session.connected', hasSession: boolean, streaming: boolean }`
- **THEN** store SHALL 将本地 `streaming` 状态同步为 `session.connected.streaming`

#### Scenario: activeApp 变为 null 时停止聊天连接

- **WHEN** 页面调用 `setActiveApp(null)`
- **THEN** store SHALL 断开当前 WebSocket 连接
- **AND** store SHALL 清空当前本地消息
- **AND** store MUST NOT 自动建立新的 chat WebSocket 连接

### Requirement: 前端必须处理 session.reconciled 通知

前端聊天 store SHALL 识别 `session.reconciled` 事件并触发已注册的回调，通知页面布局层刷新 APP 的 UI schema。

#### Scenario: 收到 session.reconciled 时触发刷新回调

- **WHEN** 前端收到 `{ type: 'session.reconciled', appSlug: string }`
- **THEN** store SHALL 调用通过 `setOnReconciled()` 注册的回调函数
- **AND** AppLayout 的回调 SHALL 重新拉取最新 UI schema
