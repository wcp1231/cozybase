## 1. 事件与状态模型

- [x] 1.1 在 `packages/ai-runtime/src/types.ts` 增加 `LifecycleEvent` 类型，并扩展 daemon/ACP 可共享的 lifecycle 事件定义
- [x] 1.2 在 `packages/daemon/src/core/event-bus.ts` 增加 `task:started` 事件，并更新 `task:completed` / `task:failed` 的类型说明以面向 orchestrator
- [x] 1.3 为 lifecycle inbox、waiter、task-lifecycle 归属和 active lifecycle 状态定义内部 TypeScript 类型

## 2. LifecycleStore 与 Orchestrator

- [x] 2.1 在 `packages/daemon/src/ai/cozybase/` 下新增 `LifecycleStore`，支持创建 active lifecycle、追加 inbox 事件、注册 waiter 和查询 lifecycle 状态
- [x] 2.2 在 `LifecycleStore` 中实现 task 与 lifecycle 的归属索引，以及 pending/completed task 集合更新逻辑
- [x] 2.3 实现 lifecycle orchestrator loop，确保同一 lifecycle 内任意时刻最多只有一个 active conversation
- [x] 2.4 实现 lifecycle 完成判定：仅在无 active conversation、inbox 为空且 pending tasks 为空时发出 `lifecycle.completed`
- [x] 2.5 实现 lifecycle 失败判定与 `lifecycle.failed` 发出逻辑

## 3. TaskRegistry 与结果回传

- [x] 3.1 在 `packages/daemon/src/ai/cozybase/task-registry.ts` 中补充 `task:started` 发布逻辑
- [x] 3.2 让 `TaskRegistry` 为 orchestrator 提供按 `taskId` 查询终态所需的稳定查询接口
- [x] 3.3 在 orchestrator 中接入 EventBus 订阅，将 `task:started` / `task:completed` / `task:failed` 转换为 lifecycle inbox 事件
- [x] 3.4 为 active lifecycle 的 pending tasks 实现基于 `TaskRegistry.getTask(taskId)` 的轮询兜底逻辑
- [x] 3.5 将 task 结果统一封装为结构化结果事件，再交给 orchestrator 决定是否启动新的 conversation

## 4. CozyBaseSession 编排改造

- [x] 4.1 在 `packages/daemon/src/ai/cozybase/session.ts` 中接入 `LifecycleStore` 和 orchestrator，替代“单 conversation 即整轮结束”的会话模型
- [x] 4.2 调整 `handleMessage()` 与 `prompt()` 逻辑，使新的用户输入在 active lifecycle 存在时进入同一 lifecycle inbox
- [x] 4.3 将 `conversation.run.completed` 降级为 conversation 边界事件，由 orchestrator 决定是否继续下一段 conversation 或结束 lifecycle
- [x] 4.4 将现有基于 `notificationQueue + injectPrompt("[系统通知] ...")` 的默认主链路改为结构化 task 结果驱动，并仅保留为可选 synthesis 手段
- [x] 4.5 更新 CozyBase Agent system prompt，使其描述 lifecycle 编排与 task 结果总结语义

## 5. ACP 生命周期收束

- [x] 5.1 在 `packages/daemon/src/acp/acp-server.ts` 中引入 lifecycle waiter 管理，而不是仅跟踪单个 active prompt
- [x] 5.2 调整 ACP `session/prompt` 逻辑：无 active lifecycle 时创建 lifecycle，有 active lifecycle 时加入现有 lifecycle
- [x] 5.3 调整 ACP 收束条件，使 `conversation.run.completed` 不再结束 prompt，而由 `lifecycle.completed` / `lifecycle.failed` 决定
- [x] 5.4 更新 ACP WebSocket 事件处理与 event mapper，使其识别并处理 `lifecycle.*` 事件

## 6. 测试与回归验证

- [x] 6.1 为 `LifecycleStore` 与 orchestrator loop 补充单元测试，覆盖 active lifecycle 创建、事件排队、task 归属和完成判定
- [x] 6.2 为 `TaskRegistry` 与 EventBus 交互补充测试，覆盖 `task:started`、完成事件推进和轮询兜底
- [x] 6.3 为 `CozyBaseSession` 补充测试，覆盖“一个 lifecycle 多段 conversation”、task 结果驱动 conversation、以及新用户输入加入 active lifecycle
- [x] 6.4 为 ACP server 补充测试，覆盖 prompt 绑定 lifecycle、多个 waiters 共享同一 lifecycle、以及 `lifecycle.completed` / `lifecycle.failed` 收束
- [x] 6.5 运行相关测试与类型检查，确认 `proposal` / `design` / `specs` 对应行为已被实现或具备明确失败点
