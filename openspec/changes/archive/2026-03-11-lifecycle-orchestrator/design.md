## Context

当前 CozyBase Agent 的上层会话模型以单次 `conversation` 为核心：用户发起一次 prompt，CozyBase Agent 完成一轮 LLM 执行后发出 `conversation.run.completed`，本轮处理即被视为结束。这个模型对同步工具调用是成立的，但对 Builder / Operator 这种异步 task 委派不成立。

现状中的关键错位：

- 上层 CozyBase Agent 负责意图理解、任务委派、异步通知三类职责，状态边界混杂。
- `TaskRegistry` 负责队列和状态，但没有上层生命周期归属模型，无法回答“某个 task 结果属于哪次用户请求”。
- 下层 task 完成后通过 EventBus 通知 CozyBaseSession，再由 CozyBaseSession 通过 `injectPrompt("[系统通知] ...")` 触发新的 conversation。这让 task 结果回传依赖额外 LLM turn，而不是依赖稳定的编排状态。
- ACP `session/prompt` 当前绑定的是单个 `conversation.run.completed`，导致 prompt 已返回后，后续 task 结果只能表现为游离的额外消息，外部 agent 无法把它视为同一次请求的结果。

本次设计目标不是将 CozyBase Agent 重构成完整 workflow engine，而是在现有单 session、单用户模型之上补上一层轻量 lifecycle orchestrator，使 `conversation` 成为 `lifecycle` 的子阶段，异步 task 成为 lifecycle 管理的事实对象。

约束前提：

- 当前不存在需要维护的历史版本协议或多版本客户端兼容负担。
- 本次设计可以直接以新 lifecycle 模型替换旧的“单 conversation + 系统通知注入”为主的完成语义，不要求长期保留双路径兼容。

## Goals / Non-Goals

**Goals:**

- 在 `conversation` 之上引入 `lifecycle` 作为上层 Agent 的完整工作单元。
- 为每个 CozyBase session 引入可查询的 lifecycle 状态存储，记录 active lifecycle、inbox、pending tasks、waiters 和 active conversation。
- 让 Builder / Operator 的 task 结果先以结构化事实进入系统，再由 orchestrator 决定是否触发新的 conversation 做总结。
- 调整 ACP 语义，使 `session/prompt` 绑定到 lifecycle 完成，而不是绑定到单段 conversation 完成。
- 允许 active lifecycle 在单线程 conversation 模型下接收新的用户输入和 task/system 事件，并按顺序推进。
- 保留现有 `TaskRegistry` 队列模型和 Builder / Operator 执行方式，尽量减少对下层 agent 的侵入。

**Non-Goals:**

- 不在本次设计中引入多用户隔离。
- 不将 CozyBase Agent 重构为通用工作流引擎或 DAG scheduler。
- 不要求 Builder / Operator 直接理解 lifecycle 概念；它们仍只处理 task。
- 不在本次设计中持久化整个 lifecycle inbox；v1 允许 daemon 重启后丢失 active lifecycle。
- 不改变 Builder / Operator 的核心工具语义和 per-app session 模型。
- 不为旧的 prompt 完成语义保留长期兼容模式。

## Decisions

### Decision 1: 引入 lifecycle，作为高于 conversation 的完成边界

**选择：** 在 CozyBase session 内新增 `lifecycle` 概念。一个 lifecycle 可包含多段 `conversation.start/end`，只有 `lifecycle.completed` 或 `lifecycle.failed` 才表示上层 Agent 的完整工作单元结束。

```text
lifecycle.start
  conversation.start   ← 用户输入驱动
  conversation.end
  conversation.start   ← task 结果驱动
  conversation.end
lifecycle.end
```

**原因：**

- `conversation` 只描述一次 LLM 执行，而 task 的真实完成发生在 conversation 外部。
- ACP 和其他外部消费方需要一个稳定的“本次请求何时真正完成”的边界。
- lifecycle 可以把多段 conversation 和多个异步 task 统一归属到同一个用户请求之下。

**替代方案：** 无

### Decision 2: 新增 Session-scoped LifecycleStore，而不是让 TaskRegistry 直接承担上层状态

**选择：** 新增 `LifecycleStore`（名称可在实现时微调），与 `TaskRegistry` 并存：

- `TaskRegistry`：task 创建、状态更新、队列推进、查询
- `LifecycleStore`：lifecycle 状态、inbox、active conversation、waiters、task-lifecycle 归属

建议状态结构：

```ts
interface LifecycleState {
  lifecycleId: string;
  status: 'active' | 'completing' | 'completed' | 'failed' | 'cancelled';
  sessionId: string;
  events: LifecycleInboxEvent[];
  pendingTaskIds: string[];
  completedTaskIds: string[];
  activeConversationId: string | null;
  waiterIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

**原因：**

- `TaskRegistry` 只知道“task 在哪条队列里”，不知道“task 属于哪次上层请求”。
- lifecycle 需要管理等待返回的 ACP prompt、当前 event inbox 和 conversation 状态，这些都不属于 task 队列职责。
- 将两者拆开后，task 可以被多种 channel 复用，orchestrator 只消费 task 事实。

**替代方案：** 无

### Decision 3: lifecycle 内采用单线程 conversation 执行模型

**选择：** 同一 lifecycle 内任意时刻最多只允许一个活跃 conversation。所有新事件先进入 inbox，等当前 conversation 结束后再决定是否启动下一段 conversation。

事件类型统一建模为：

- `user_message`
- `task_completed`
- `task_failed`
- `system_notice`
- `control`

执行规则：

1. 如果没有 active conversation，orchestrator 取出 inbox 中的可执行事件，组装为下一段 conversation 输入。
2. conversation 运行时，新来的用户输入、task 结果、系统通知只入队，不抢占。
3. conversation 结束后：
   - inbox 非空：继续下一段 conversation
   - inbox 为空且 `pendingTaskIds` 非空：保持 lifecycle 活跃，等待事件
   - inbox 为空且 `pendingTaskIds` 为空：结束 lifecycle

**原因：**

- 当前 CozyBase Agent 和底层 provider 本就按单轮 turn 顺序执行，单线程模型最贴合现有实现。
- 避免 task 结果与用户新消息并发进入 LLM，减少上下文竞争和竞态。

**替代方案：** 无

### Decision 4: task 结果先作为结构化事实进入 lifecycle，再决定是否触发 LLM 总结

**选择：** task 完成或失败后，先写入 `TaskRegistry`，再经 EventBus 或轮询进入 lifecycle inbox。orchestrator 先处理结构化事实，再决定是否开启新的 conversation 让 CozyBase Agent 进行自然语言总结。

建议 task result 形态：

```ts
interface TaskResultEnvelope {
  taskId: string;
  lifecycleId: string;
  appSlug: string;
  target: 'builder' | 'operator';
  status: 'completed' | 'failed';
  summary: string;
  payload?: unknown;
  error?: string;
}
```

**原因：**

- 结果的主存储应是 machine-readable 的 task 事实，而不是 LLM 生成的二次描述。
- ACP、Web、后续自动化入口都可以直接消费 task 结果，不强依赖额外 LLM 调用。
- 只有在需要对用户解释、继续规划或合并多个结果时，才值得再跑一段 conversation。

**替代方案：** 每次 task 完成都强制重新触发 CozyBase Agent。问题是延迟更高、成本更高，且结果链路仍然依赖对话副作用。

### Decision 5: EventBus 为主，TaskRegistry 轮询为兜底

**选择：** lifecycle orchestrator 通过两种方式感知 task 状态：

- 快路径：订阅 EventBus 的 `task.started / task.completed / task.failed`
- 兜底路径：当存在 active lifecycle 且 `pendingTaskIds` 非空时，按短周期查询 `TaskRegistry.getTask(taskId)`

**原因：**

- EventBus 适合低延迟推进 lifecycle。
- 轮询可以覆盖边界时序问题、重连后错过事件、future bug 等异常情况。
- lifecycle 的 pending tasks 数量有限，按 active lifecycle 范围轮询成本可控。

**替代方案：** 只用 EventBus。问题是事件丢失后 lifecycle 可能永远不结束。

### Decision 6: ACP `session/prompt` 绑定 lifecycle，而不是绑定单次 conversation

**选择：** ACP 侧为每次 prompt 注册一个 waiter，但 waiter 的完成以 `lifecycle.completed` / `lifecycle.failed` 为准。

语义细则：

- 如果当前没有 active lifecycle，则创建一个新的 lifecycle 并将本次 prompt 作为首个 `user_message` 事件入队。
- 如果已有 active lifecycle，则本次 prompt 作为新的 `user_message` 事件追加到同一 lifecycle inbox，并注册为附加 waiter。
- `conversation.run.completed` 只表示 lifecycle 内某一段 conversation 完成，ACP 不在此时 resolve。
- 只有 lifecycle 结束时，所有挂在该 lifecycle 上的 ACP waiters 才统一完成。

**原因：**

- 这让 ACP 可以把“同一次用户请求 + 其派生 task + 后续结果整合”视为一个完整单元。
- 同一 active lifecycle 期间允许新用户输入加入同一请求上下文，避免额外开启割裂的新生命周期。

**替代方案：** 无

### Decision 7: 保持单 session、单 active lifecycle 的 v1 范围

**选择：** 每个 CozyBase session 在 v1 只允许一个 active lifecycle。

**原因：**

- 当前 CozyBaseSessionManager 本就是单例模型，先维持这个约束可以降低复杂度。
- 单 active lifecycle 已足够覆盖 ACP 和 Web 的主要问题。
- 多 active lifecycle 会带来 waiter 分发、event routing、session history 合并等额外复杂度。

**替代方案：** 无

## Risks / Trade-offs

- **[lifecycle 状态增加复杂度]** → 将 lifecycle、task、conversation 三层边界严格拆分，并限制 v1 为单 active lifecycle。
- **[active lifecycle 接收新用户输入会拉长 prompt 等待时间]** → 在 ACP metadata 中标记 prompt 是“新建 lifecycle”还是“加入现有 lifecycle”，让客户端可以做更好展示。
- **[继续保留 LLM 总结会增加成本]** → 只在需要用户可读回复或需要基于结果继续规划时触发新的 conversation。
- **[daemon 重启后 lifecycle 丢失]** → v1 明确 active lifecycle 仅内存存储；TaskRegistry 查询和 Builder/Operator snapshot 恢复作为后续增强基础。
- **[轮询 TaskRegistry 可能带来额外开销]** → 仅在存在 active lifecycle 且 `pendingTaskIds` 非空时启用，轮询范围限制在该 lifecycle 的 task 集合。
- **[ACP waiters 统一收束后，多个 prompt 可能一起完成]** → 通过 waiter 元数据和 lifecycle 事件明确归属，避免客户端误认为每个 prompt 对应独立 lifecycle。

## Migration Plan

1. 先扩展事件和状态模型：
   - 在 `packages/ai-runtime/src/types.ts` 增加 lifecycle 级事件
   - 在 `EventBus` 中补足 task 生命周期事件
2. 在 `packages/daemon/src/ai/cozybase/` 引入 `LifecycleStore` 与 orchestrator loop：
   - 直接接管 task 结果归属、inbox 和 lifecycle 完成判定
3. 调整 `CozyBaseSession`：
   - 将 `conversation.run.completed` 视为 conversation 边界
   - 由 orchestrator 决定何时发出 `lifecycle.completed`
4. 调整 ACP bridge：
   - `session/prompt` 改为等待 lifecycle 结束
   - 允许 prompt 加入 active lifecycle
5. 将以 `[系统通知]` 注入为主链路的旧逻辑降级为可选 synthesis 手段，不再作为默认结果回传机制

回滚策略：

- 若新 lifecycle 收束逻辑出现问题，可退回“单 prompt 绑定单次 conversation”的旧 ACP 收束方式
- `TaskRegistry` 和 Builder / Operator 执行层无需回滚，只需关闭 orchestrator 对 lifecycle 的新依赖

## Open Questions

- lifecycle 是否需要在后续版本持久化到 SQLite，以支持 daemon 重启后的恢复？
- ACP waiters 在加入已有 lifecycle 时，最终 `PromptResponse` 是否需要回显更丰富的 lifecycle 状态摘要？
- Web UI 是否也要显式展示 lifecycle 边界，还是继续仅展示 conversation 级消息流？
- task `payload` 的标准结构是否需要在本次变更中统一，还是先允许不同 target 使用松散结构？
