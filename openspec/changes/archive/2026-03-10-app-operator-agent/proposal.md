## Why

当前 cozybase 的 AI Agent 主要面向 APP 的创建与修改，缺少一个面向最终使用场景的通用 Operator Agent。用户已经可以通过 Stable APP 的 functions 和 `_db` REST API 读写业务数据，但还不能在 APP 内通过自然语言直接完成记录、查询、更新等日常操作。

需要补上这层能力，让用户可以进入某个 APP 的专属会话，通过自然语言调用该 APP 已暴露的稳定运行时能力；同时为后续跨 APP 路由与编排打下基础。

这次 change 的实际落点也不仅是“新增一个 Operator Agent”，而是把原本分散的 Agent 代码重新收敛为：
- 统一的 provider/runtime 层
- 对称的 Builder / Operator usage 层
- daemon 内共享的 runtime-backed session skeleton

因此文档应以这次架构收敛为主线，`pi-agent-core` 仅保留为兼容性 runtime provider，而不是 Operator 的中心实现。

## What Changes

- 新增独立的 `packages/operator-agent` package，封装 APP Operator Agent 的 provider-neutral usage 逻辑（actions、prompt builder、类型）
- 将通用 provider/runtime 抽象统一收敛到 `packages/ai-runtime`，并补上 Builder 对称的 `packages/builder-agent` usage package
- 扩展 Operator Agent，使其通过 `packages/ai-runtime` 接入 `codex`、`claude-code` 和兼容性的 `pi-agent-core` runtime provider；当前主验证路径以 Codex / Claude Code 为主
- 将 Operator 配置拆分为 “agent runtime provider” 与 “底层模型 provider / model” 两层，避免 `operator.provider` 既表示 runtime 又表示模型厂商
- 为 Operator usage 增加 provider-neutral action 定义，并复用统一的 MCP/native adapter 装配路径；usage 层不直接绑定某一种 provider transport
- 在 daemon 中新增 per-app 的 `OperatorSession` / `OperatorSessionManager`，实现 `1 APP : 1 session` 的会话模型，面向单人、本地持久化场景
- 将 Builder 与 Operator 的 WebSocket/session/history 生命周期收敛为共享的 runtime-backed session skeleton，只保留 prompt、context、tools 等 usage 差异
- 在 Web 前端的 APP 使用页面复用现有 Chat Panel，接入 Operator Agent 聊天入口；Home 页面、APP 列表和 Console 暂不暴露入口
- Operator Agent 仅面向 Stable APP，通过 APP 的 REST API 使用 APP 能力，不直接执行 Stable mode SQL DML
- 首批提供较细粒度的 Operator tools，包括 schema 读取、数据查询、记录创建、记录更新、记录删除、以及自定义 function 调用
- 启动 OperatorSession 时动态读取 APP schema 与可用 functions，构建 app-specific system prompt，帮助 Agent 理解当前 APP 的数据结构与能力边界
- 持久化 Operator session 的 provider-native snapshot，并将其统一投影为标准化 `session.history`，保证多轮对话可持续使用
- 增加 Operator Agent 的 LLM provider / model 配置入口；`pi-agent-core` 保留兼容性的 `pi-ai` 解析路径，`codex` / `claude-code` 直接使用 provider-specific model
- Phase 1 仅覆盖单 APP 的 Operator 能力，不包含跨 APP 路由、跨 APP 联动和通用 Router Agent

## Capabilities

### New Capabilities
- `app-operator-agent`: 定义 Stable APP 的 Operator Agent 会话模型、工具集合、schema 感知 prompt 构建、消息持久化与 APP 内自然语言操作流程
- `operator-llm-settings`: 定义 Operator Agent 所需的 provider、model 与 API key 配置约束，以及 daemon 对这些配置的加载与校验方式

### Modified Capabilities
- `platform-client`: 增加 daemon 与 Stable APP 运行时之间为 Operator Agent 服务的调用约束，包括通过 `_db` REST API 与自定义 functions 访问 APP 能力的接口要求

## Impact

- `packages/ai-runtime`：统一的 provider/runtime 抽象、事件类型和 provider registry
- `packages/builder-agent`：Builder usage 的纯 prompt / app-info 抽取逻辑
- `packages/operator-agent`：Operator Agent package、provider-neutral action 定义、prompt builder、native/MCP adapter
- `packages/daemon`：新增 Operator session 管理、共享 runtime-backed session skeleton、runtime provider 解析、MCP/native tool mode 装配、WebSocket/HTTP 接入与平台 migration
- `packages/runtime` / Stable APP functions：复用现有 `_db` REST API 与 custom functions 作为 Operator Agent 的执行面
- 平台配置与本地数据：新增 Operator session 存储，以及 Operator Agent 的 runtime provider / model 配置需求
