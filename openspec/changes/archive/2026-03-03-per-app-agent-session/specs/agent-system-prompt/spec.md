# Agent System Prompt

## ADDED Requirements

### Requirement: System prompt 必须包含当前 APP 上下文

系统 SHALL 基于当前 APP 名称动态构建 Agent system prompt。生成的 prompt MUST 明确指出 Agent 正在编辑的 APP 名称，并要求默认将工具调用目标限定为该 APP，除非用户显式要求操作其他 APP。

#### Scenario: Prompt 中包含当前 APP 名称

- **WHEN** 系统为 APP `orders` 创建 Agent 会话
- **THEN** 该会话使用的 system prompt SHALL 明确包含 `orders` 这一 APP 名称
- **AND** prompt SHALL 说明默认工具调用目标为 `orders`

#### Scenario: 不同 APP 的 prompt 内容不同

- **WHEN** 系统分别为 APP `orders` 和 APP `inventory` 创建 Agent 会话
- **THEN** 两个会话生成的 system prompt SHALL 使用各自的 APP 名称
- **AND** prompt 中的默认工具目标说明 SHALL 与各自 APP 保持一致

### Requirement: System prompt 必须引导 Agent 先建立当前 APP 认知

系统生成的 system prompt SHALL 包含明确指令，要求 Agent 在新会话开始时主动读取当前 APP 的状态，再继续执行用户请求。

#### Scenario: Prompt 包含获取当前 APP 状态的指令

- **WHEN** 系统为 APP `orders` 构建 system prompt
- **THEN** prompt SHALL 明确要求 Agent 在对话开始时主动读取 `orders` 的当前状态
- **AND** prompt SHALL 指向使用 `fetch_app` 一类的工具来建立上下文
