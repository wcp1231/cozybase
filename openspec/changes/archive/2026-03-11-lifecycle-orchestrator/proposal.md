## Why

当前 CozyBase Agent 以上层单次 `conversation` 作为完成边界，而 Builder / Operator 的实际执行是异步 task。这导致 `conversation.run.completed` 被误当成整次用户请求完成，异步结果只能通过后续“再开一轮 conversation + 系统通知注入”的方式补回，ACP 也无法稳定感知同一次请求派生的 task 何时真正完成。随着多 agent 协作和外部 ACP 接入落地，这个问题已经从体验问题升级为编排模型缺陷，需要补上一层高于 `conversation` 的持久 lifecycle。

## What Changes

- 新增 session-scoped 的 lifecycle orchestrator，在 `conversation` 之上引入 `lifecycle` 作为上层 Agent 的完整工作单元。
- 为 CozyBase session 增加 `LifecycleStore`（或等价的 Session State Store），记录 active lifecycle、event inbox、pending tasks、waiters 和 active conversation。
- 保留 `TaskRegistry` 负责 task 派发、队列与状态管理，同时让 orchestrator 通过 EventBus 订阅 task 结果，并支持轮询 TaskRegistry 做兜底。
- 将下层 Builder / Operator 的结果先落为结构化 task 事实，再由 orchestrator 决定是否触发新的 conversation 做总结，而不是直接依赖 `injectPrompt("[系统通知] ...")` 作为主链路。
- 调整 ACP 收束语义：一个 `session/prompt` 绑定到一个 lifecycle，而不是绑定到单个 `conversation.run.completed`；同一个 lifecycle 可包含多个 `conversation.start/end`。
- 允许 active lifecycle 在单线程 conversation 执行模型下接收新的用户输入和 task/system 事件，并按队列顺序推进后续 conversation。

## Capabilities

### New Capabilities

- `lifecycle-orchestrator`: 定义 CozyBase 上层 agent 的 lifecycle / conversation / task 编排模型、状态存储、事件队列和完成条件。

### Modified Capabilities

- `cozybase-agent`: 将上层 CozyBase Agent 从“异步通知注入”模型调整为“lifecycle 驱动的轻量编排器”，改变 task 结果回传与 conversation 组织语义。
- `acp-server`: 将 ACP `session/prompt` 的完成边界从单次 `conversation.run.completed` 调整为 `lifecycle.completed` / `lifecycle.failed`，并允许 prompt 加入 active lifecycle。
- `agent-event-types`: 扩展现有事件模型，使系统可以表达 lifecycle 级别的开始、结束、失败，以及结构化 task 结果事件。

## Impact

- 影响代码：`packages/daemon/src/ai/cozybase/`、`packages/daemon/src/acp/`、`packages/daemon/src/core/event-bus.ts`、`packages/ai-runtime/src/types.ts`
- 影响系统：CozyBase Agent session 管理、TaskRegistry / EventBus 交互、ACP prompt 生命周期、WebSocket 事件流
- 影响协议：CozyBase 内部 WebSocket 事件将新增 lifecycle 级别语义，ACP prompt 的收束逻辑会基于 lifecycle 而非单段 conversation
