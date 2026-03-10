# Operator LLM Settings

## Purpose

Define how Operator Agent runtime providers, models, and credentials are configured in workspace settings, including compatibility behavior for the legacy `pi-agent-core` path.

## Requirements

### Requirement: Operator Runtime Provider 和 Model 配置

平台 SHALL 提供 Operator Agent 的 runtime provider 与 model 配置入口，支持用户在 `pi-agent-core`、`codex`、`claude-code` 三种 runtime provider 之间选择。

- 配置 key SHALL 使用 `operator.agent_provider`、`operator.model_provider`、`operator.model`
- `operator.agent_provider` SHALL 表示 runtime provider，取值为 `pi-agent-core`、`codex`、`claude-code`
- `operator.model_provider` SHALL 仅在 `operator.agent_provider = 'pi-agent-core'` 时生效，用于选择 `pi-ai` 的底层模型厂商（如 `anthropic`、`openai`、`google`）
- `operator.model` SHALL 表示传给所选 runtime provider 的模型标识
- daemon 启动时 SHALL 校验 `operator.agent_provider` 已在 `packages/ai-runtime` 的 provider registry 中注册
- 当 `operator.agent_provider = 'pi-agent-core'` 时，daemon SHALL 校验 `operator.model_provider` 和 `operator.model` 在 `pi-ai` 的已知 model 注册表中存在
- 若配置缺失或无效，daemon SHALL 回退到默认配置（`agent_provider: 'pi-agent-core'`, `model_provider: 'anthropic'`, `model: 'claude-sonnet-4-20250514'`）
- `pi-agent-core` SHALL 被视为兼容性 runtime provider；Operator 的主验证路径 SHOULD 以 `codex` 或 `claude-code` 为主

#### Scenario: pi-agent-core 配置加载

- **WHEN** 用户配置 `operator.agent_provider = 'pi-agent-core'`、`operator.model_provider = 'openai'` 和 `operator.model = 'gpt-4o-mini'`
- **THEN** daemon SHALL 使用 `pi-ai` 的 `getModel('openai', 'gpt-4o-mini')` 获取 Model 实例
- **AND** 该 Model 实例 SHALL 传递给所有新创建的 OperatorSession

#### Scenario: codex 配置加载

- **WHEN** 用户配置 `operator.agent_provider = 'codex'` 和 `operator.model = 'gpt-5.4'`
- **THEN** daemon SHALL 选择 `codex` runtime provider
- **AND** 将 `gpt-5.4` 作为 provider-specific model 传递给新创建的 OperatorSession

#### Scenario: claude-code 配置加载

- **WHEN** 用户配置 `operator.agent_provider = 'claude-code'` 和 `operator.model = 'claude-sonnet-4-6'`
- **THEN** daemon SHALL 选择 `claude-code` runtime provider
- **AND** 将 `claude-sonnet-4-6` 作为 provider-specific model 传递给新创建的 OperatorSession

#### Scenario: pi-agent-core 的 model 不存在

- **WHEN** 用户配置 `operator.agent_provider = 'pi-agent-core'` 且 `operator.model = 'nonexistent-model'`
- **THEN** daemon SHALL 在启动时输出警告日志
- **AND** 回退使用默认 model

#### Scenario: runtime provider 配置缺失

- **WHEN** 用户未配置任何 operator LLM 设置
- **THEN** daemon SHALL 使用默认配置 `agent_provider: 'pi-agent-core'`, `model_provider: 'anthropic'`, `model: 'claude-sonnet-4-20250514'`
- **AND** 该默认值 SHALL 被视为向后兼容策略，而不是推荐的主使用路径

#### Scenario: 兼容旧配置 key

- **WHEN** 用户仅配置旧的 `operator.provider = 'anthropic'` 且未配置 `operator.agent_provider`
- **THEN** daemon SHALL 将该值解释为 `operator.model_provider`
- **AND** 默认使用 `operator.agent_provider = 'pi-agent-core'`
- **AND** 文档 SHOULD 指引用户显式迁移到 `operator.agent_provider` / `operator.model_provider` / `operator.model`

### Requirement: API Key 通过环境变量传递

Operator Agent 的运行时凭据 SHALL 通过各 runtime provider 既有约定获取，不以明文存储在配置文件中。

- 当 `operator.agent_provider = 'pi-agent-core'` 时，daemon SHALL 继续通过 `pi-ai` 的 `getEnvApiKey(provider)` 读取对应环境变量
- 当 `operator.agent_provider = 'codex'` 或 `operator.agent_provider = 'claude-code'` 时，daemon SHALL 依赖对应 runtime provider 已有的 CLI / SDK 凭据解析机制
- 当所需凭据未设置时，Agent 的调用 SHALL 失败并返回可理解的错误消息

#### Scenario: pi-agent-core 环境变量已设置

- **WHEN** 用户配置 `operator.agent_provider = 'pi-agent-core'`、`operator.model_provider = 'anthropic'` 且 `ANTHROPIC_API_KEY` 环境变量已设置
- **THEN** Agent 的 LLM 调用 SHALL 使用该 API Key 成功发起请求

#### Scenario: pi-agent-core 环境变量未设置

- **WHEN** 用户配置 `operator.agent_provider = 'pi-agent-core'`、`operator.model_provider = 'openai'` 但 `OPENAI_API_KEY` 环境变量未设置
- **THEN** Agent 的 prompt 调用 SHALL 抛出错误
- **AND** 错误消息 SHALL 明确说明需要设置哪个环境变量

### Requirement: 配置存储位置

Operator LLM 配置 SHALL 存储在平台的 workspace 配置中，与现有 daemon 配置机制一致。

- 配置 key SHALL 使用 `operator.agent_provider`、`operator.model_provider` 和 `operator.model` 命名空间
- 配置变更后 SHALL 在下一次创建 OperatorSession 时生效，不影响已有活跃 session

#### Scenario: 修改配置后新 session 使用新 model

- **WHEN** 用户将配置从 `operator.agent_provider = 'codex', operator.model = 'gpt-5.4'` 改为 `operator.agent_provider = 'claude-code', operator.model = 'claude-sonnet-4-6'`
- **AND** 随后进入某个 APP 的 Operator 聊天
- **THEN** 新创建的 OperatorSession SHALL 使用 `claude-code` runtime provider 和 `claude-sonnet-4-6`

#### Scenario: 已有 session 不受配置变更影响

- **WHEN** APP A 已有一个活跃的 OperatorSession 使用 `codex / gpt-5.4`
- **AND** 用户修改了 `operator.agent_provider` 或 `operator.model` 配置
- **THEN** APP A 的活跃 OperatorSession SHALL 继续使用原有配置，直到 session 被销毁或重建
