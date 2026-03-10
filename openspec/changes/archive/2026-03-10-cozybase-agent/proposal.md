## Why

当前 Cozybase 的用户交互模型是"APP 为中心"：用户先选择一个 APP，再与该 APP 的 Builder Agent（开发）或 Operator Agent（使用）对话。每个 Agent session 永久绑定单个 APP。

这个模型在 Web UI 下工作良好，但有三个局限：

1. **无法跨 APP 操作**：用户要先在 UI 上切换 APP，才能和另一个 APP 的 Agent 对话
2. **无法对外集成**：外部平台（如 OpenClaw）接入时，不知道应该路由到哪个 APP 的 session
3. **缺少统一入口**：用户必须先知道 APP 存在，才能进入它的 Agent 对话

需要一个平台级的核心 Agent——CozyBase Agent——作为统一的对话入口。用户只需与它对话，它负责理解用户意图，将任务委派给正确 APP 的 Builder 或 Operator session 执行。

这个能力是基础设施，独立于 ACP/OpenClaw 集成。无论是未来的 Web UI 专属页面、ACP 协议接入，还是其他第三方集成，都以 CozyBase Agent 为核心对话入口。

## What Changes

- 新增 `packages/cozybase-agent` package，定义 CozyBase Agent 的 tool 集合、system prompt 构建和类型导出
- CozyBase Agent 拥有少量高层工具，分为两类：
  - **直接工具**：list_apps、get_app_status、start_app、stop_app、delete_app（轻量 API 调用，Agent 自己执行）
  - **委派工具**：create_app、develop_app、operate_app（将任务委派给 Builder/Operator session，异步执行）
- 在 daemon 中新增 `CozyBaseSession` 和 `CozyBaseSessionManager`，实现 CozyBase Agent 的会话管理
- 委派工具采用"异步委派 + 完成通知"模型：CozyBase Agent 发起委派后立即返回，子 session 在后台执行，完成后通过 EventBus 通知 CozyBase Agent session
- 扩展现有 EventBus，新增 `task:completed` 和 `task:failed` 事件，供跨 session 通信
- CozyBase Agent 使用独立的 LLM provider/model 配置，推荐使用轻量模型（Haiku/GPT-4o-mini）
- 新增 WebSocket 端点 `/api/v1/cozybase/ws`，不绑定具体 APP
- CozyBase Agent 的消息历史独立持久化，不与任何 per-app session 共享

## Capabilities

### New Capabilities
- `cozybase-agent`: 定义 CozyBase Agent 的工具集合、委派模型、system prompt 构建、session 管理和异步任务通知机制

### Modified Capabilities
- `agent-chat-service`: Builder/Operator session 完成委派任务后，通过 EventBus 发布 `task:completed` 事件
- `agent-event-types`: 新增 `task:completed` / `task:failed` 事件类型，用于跨 session 通知

## Impact

- `packages/cozybase-agent`：新 package，定义 tool schema、prompt builder、类型导出
- `packages/daemon/src/ai/cozybase/`：CozyBase Agent 的 session 和 session manager
- `packages/daemon/src/core/event-bus.ts`：扩展事件类型，支持异步任务通知
- `packages/daemon/src/ai/runtime-agent-session.ts`：子 session 完成时发布事件
- `packages/daemon/src/index.ts`：新增 WebSocket 端点
- 配置：新增 CozyBase Agent 的 LLM provider / model 配置项
