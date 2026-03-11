## ADDED Requirements

### Requirement: CozyBaseSession SHALL 以 lifecycle 组织多段 conversation

CozyBaseSession SHALL 将一次完整用户请求组织为一个 lifecycle。一个 lifecycle MAY 包含多段 conversation，并 SHALL 由 orchestrator 根据用户输入、task 结果和系统事件决定何时启动下一段 conversation。

#### Scenario: task 结果驱动新的 conversation

- **WHEN** active lifecycle 收到 task 完成结果
- **AND** 当前没有 active conversation
- **THEN** orchestrator SHALL 以该 task 结果为输入启动新的 conversation

#### Scenario: 用户输入加入 active lifecycle

- **WHEN** active lifecycle 正在等待 task 结果或排队处理事件
- **AND** 收到新的用户输入
- **THEN** CozyBaseSession SHALL 将该输入加入当前 lifecycle
- **AND** MUST NOT 为该输入创建新的独立 session

## MODIFIED Requirements

### Requirement: 异步任务完成通知注入对话流

CozyBaseSession SHALL 将 EventBus 的 task 生命周期事件作为 lifecycle 的结构化输入，而不是默认通过 `injectPrompt()` 直接注入 `[系统通知]` 文本。task 结果 SHALL 先进入 active lifecycle 的 inbox，再由 orchestrator 决定是否需要启动新的 conversation 生成用户可读回复。

#### Scenario: task 完成结果进入 lifecycle inbox

- **WHEN** EventBus 发布 `task:completed` 事件，包含 `{ taskId, appSlug, summary }`
- **THEN** CozyBaseSession SHALL 将该结果写入所属 lifecycle 的 inbox
- **AND** SHALL 将对应 task 从 pending 集合移出
- **AND** MUST NOT 默认立即调用 `injectPrompt()`

#### Scenario: task 失败结果进入 lifecycle inbox

- **WHEN** EventBus 发布 `task:failed` 事件，包含 `{ taskId, appSlug, error }`
- **THEN** CozyBaseSession SHALL 将该失败结果写入所属 lifecycle 的 inbox
- **AND** SHALL 将对应 task 从 pending 集合移出

#### Scenario: active conversation 期间结果排队

- **WHEN** lifecycle 当前已有 active conversation
- **AND** 此时收到 `task:completed` 或 `task:failed`
- **THEN** 该结果 SHALL 进入 lifecycle inbox
- **AND** SHALL 在当前 conversation 结束后再被处理

#### Scenario: 仅在需要时触发总结 conversation

- **WHEN** lifecycle inbox 中存在 task 结果
- **AND** orchestrator 需要向用户解释结果或基于结果继续规划
- **THEN** CozyBaseSession SHALL 启动新的 conversation
- **AND** 该 conversation SHALL 以结构化 task 结果作为输入

### Requirement: System Prompt 包含工具使用指引

CozyBase Agent 的 system prompt SHALL 在 session 创建时构建，包含 Agent 的角色定位、直接工具说明、委派工具说明、lifecycle 行为说明和交互规范。

#### Scenario: System prompt 包含完整的工具指引

- **WHEN** CozyBaseSession 创建并初始化 Agent
- **THEN** system prompt SHALL 描述 Agent 为“CozyBase Agent，Cozybase 平台的核心 AI 助手”
- **AND** SHALL 列出所有直接工具及其用途
- **AND** SHALL 列出所有委派工具及其异步行为
- **AND** SHALL 说明 task 结果会以 lifecycle 事件进入系统并由 Agent 在需要时进行总结

#### Scenario: System prompt 指导 APP 识别策略

- **WHEN** system prompt 被构建
- **THEN** SHALL 包含指引，要求 Agent 在操作具体 APP 前先调用 `list_apps` 了解现有应用
- **AND** SHALL 指导 Agent 根据上下文推断目标 APP
