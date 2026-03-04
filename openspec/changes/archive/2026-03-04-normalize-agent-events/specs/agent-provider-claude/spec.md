## ADDED Requirements

### Requirement: ClaudeCodeProvider 必须将 SDKMessage 流转换为 AgentEvent 流

`ClaudeCodeProvider` SHALL 实现 `AgentProvider` 接口，消费 `@anthropic-ai/claude-agent-sdk` 的 `query()` 返回的 `AsyncGenerator<SDKMessage>`，并将其转换为标准 `AgentEvent` 流。所有 Claude SDK 特有的消息解析逻辑 SHALL 封装在 provider 内部，不泄漏到调用方。

#### Scenario: system 消息转换为 conversation.notice

- **WHEN** Claude SDK 发出 `{ type: 'system', subtype: 'init', model: string, tools: string[] }` 消息
- **THEN** provider SHALL emit `{ type: 'conversation.notice', message: string }`
- **AND** 调用方 MUST NOT 收到任何 Claude SDK 原始消息格式

#### Scenario: assistant 消息的文本块转换为 message.completed

- **WHEN** Claude SDK 发出 `{ type: 'assistant', message: { content: [...] } }` 消息
- **AND** content 数组中存在至少一个 `{ type: 'text', text: string }` 块
- **THEN** provider SHALL emit `{ type: 'conversation.message.completed', messageId: string, role: 'assistant', content: 拼合后的文本 }`

#### Scenario: assistant 消息的 tool_use 块转换为 tool.started

- **WHEN** Claude SDK 发出 `assistant` 消息
- **AND** content 数组中存在一个或多个 `{ type: 'tool_use', id: string, name: string }` 块
- **THEN** provider SHALL 为每个 tool_use 块各 emit 一个 `{ type: 'conversation.tool.started', toolUseId: id, toolName: name }`
- **AND** provider SHALL 内部记录 `toolUseId → toolName` 的映射，供后续 tool_use_summary 查找

#### Scenario: 纯 tool_use 的 assistant 消息不产生 message 事件

- **WHEN** Claude SDK 发出 `assistant` 消息且 content 数组只包含 tool_use 块而不含 text 块
- **THEN** provider MUST NOT emit 任何 `conversation.message.*` 事件
- **AND** SHALL 仅 emit 对应的 `conversation.tool.started` 事件

#### Scenario: tool_progress 转换为 conversation.tool.progress

- **WHEN** Claude SDK 发出 `{ type: 'tool_progress', tool_use_id: string, tool_name: string }` 消息
- **THEN** provider SHALL emit `{ type: 'conversation.tool.progress', toolUseId: tool_use_id, toolName: tool_name }`

#### Scenario: tool_use_summary 转换为 conversation.tool.completed

- **WHEN** Claude SDK 发出 `{ type: 'tool_use_summary', summary: string, preceding_tool_use_ids: string[] }` 消息
- **THEN** provider SHALL 从内部 `toolUseId → toolName` 映射表中查找 `preceding_tool_use_ids[0]` 对应的工具名
- **AND** provider SHALL emit `{ type: 'conversation.tool.completed', toolUseId: preceding_tool_use_ids[0], toolName: 查找到的工具名, summary: summary }`

#### Scenario: result 成功转换为 conversation.run.completed

- **WHEN** Claude SDK 发出 `{ type: 'result', is_error: false, session_id: string }` 消息
- **THEN** provider SHALL emit `{ type: 'conversation.run.completed', sessionId: session_id }`

#### Scenario: result 错误转换为 conversation.error

- **WHEN** Claude SDK 发出 `{ type: 'result', is_error: true, errors: string[] }` 消息
- **THEN** provider SHALL emit `{ type: 'conversation.error', message: errors.join('; ') }`
- **AND** MUST NOT emit `conversation.run.completed`

#### Scenario: user 消息（resume 回放）被过滤

- **WHEN** Claude SDK 发出 `{ type: 'user' }` 消息（session resume 时的历史回放）
- **THEN** provider MUST NOT emit 任何 AgentEvent
- **AND** 调用方 MUST NOT 感知到该消息的存在

### Requirement: ClaudeCodeProvider 必须管理流式消息的 messageId 生命周期

Provider SHALL 通过追踪流式信号自动生成 `messageId`，在首次 delta 到来时 emit `message.started`，使调用方无需了解 Claude SDK 的 streaming 内部结构。

#### Scenario: 首次文本 delta 前自动 emit message.started

- **WHEN** Claude SDK 发出 `stream_event` 且其内部事件为 `content_block_start`（text 类型）
- **THEN** provider SHALL emit `{ type: 'conversation.message.started', messageId: 新生成的ID, role: 'assistant' }`
- **AND** 后续该消息的所有 delta 和 completed 事件 SHALL 携带相同的 `messageId`

#### Scenario: 流式文本 delta 转换为 message.delta

- **WHEN** Claude SDK 发出 `stream_event` 且其内部为 `content_block_delta`（text_delta 类型）
- **THEN** provider SHALL emit `{ type: 'conversation.message.delta', messageId: 当前追踪ID, role: 'assistant', delta: text }`

#### Scenario: 完整 assistant 消息中止当前流式追踪

- **WHEN** provider emit `conversation.message.completed` 后
- **THEN** provider SHALL 重置当前追踪的 `messageId` 为 null
- **AND** 下次新的文本输出 SHALL 使用新的 `messageId`

### Requirement: ClaudeCodeProvider 必须支持 session 恢复

Provider SHALL 接受 `AgentQueryConfig.resumeSessionId`，在创建 Claude SDK query 时通过 `options.resume` 恢复上次会话的上下文。

#### Scenario: 携带 resumeSessionId 时恢复会话上下文

- **WHEN** 调用方通过 `config.resumeSessionId = 'sess_abc'` 创建查询
- **THEN** provider SHALL 将 `options.resume = 'sess_abc'` 传入 Claude SDK `query()`
- **AND** Claude SDK SHALL 恢复之前的会话上下文而无需重新发送历史消息

#### Scenario: 不携带 resumeSessionId 时开始新会话

- **WHEN** 调用方的 `config.resumeSessionId` 为 undefined 或 null
- **THEN** provider SHALL 调用不带 `resume` 选项的 `query()`
- **AND** 开始一次全新的会话

#### Scenario: session 恢复失败时 emit conversation.error

- **WHEN** 携带了 `resumeSessionId` 但 Claude SDK 抛出与 session 相关的错误
- **THEN** provider SHALL emit `{ type: 'conversation.error', message: 错误描述 }`

### Requirement: AgentQuery 必须支持中断和资源清理

`ClaudeCodeProvider.createQuery()` 返回的 `AgentQuery` 实现 SHALL 支持 `interrupt()` 和 `close()`，分别对应中断当前执行和释放底层资源。

#### Scenario: interrupt() 中止正在进行的 Agent 查询

- **WHEN** 调用 `agentQuery.interrupt()`
- **THEN** 底层 Claude SDK Query 的 `interrupt()` SHALL 被调用
- **AND** Agent 停止产生新的输出

#### Scenario: close() 释放底层 SDK 进程资源

- **WHEN** 调用 `agentQuery.close()`
- **THEN** 底层 Claude SDK Query 的 `close()` SHALL 被调用
- **AND** 相关进程资源 SHALL 被释放
