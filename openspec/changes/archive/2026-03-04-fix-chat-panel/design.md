## Context

ChatPanel 是 AI Builder 模式下用户与 Agent 交互的核心界面。当前存在三个问题：消息持久化丢失中间 assistant 回复、工具调用消息展示不直观、`reconcile_app` 后 UI 不自动刷新。

**现有架构关键路径：**

```
Claude Agent SDK (query())
  │ for-await 迭代 SDKMessage
  ▼
ChatSession.forwardSdkMessage()
  │ 过滤 user 类型，其余原样转发
  ▼
WebSocket → 浏览器
  │ JSON.parse
  ▼
chat-store.ts handleMessage()
  │ switch(msg.type) 分发处理
  ▼
ChatPanel 组件渲染
```

**关键约束：**

- SDK 真实消息类型包含 `tool_progress`（工具开始执行）和 `tool_use_summary`（工具完成摘要），均为原生类型
- `LocalBackend` 不持有 `ChatSessionManager` 引用，MCP handler 无法直接通知 ChatSession
- `EventBus` 已存在但尚未连接任何消费者

## Goals / Non-Goals

**Goals:**

- 完整保留每轮对话中所有有实质内容的 assistant 消息，刷新/重连后消息历史无丢失
- 工具调用过程在 ChatPanel 中以可折叠卡片形式可见，支持 running/done/error 状态区分
- `reconcile_app` 执行完成后前端自动拉取最新 UI schema，用户无需手动刷新

**Non-Goals:**

- 不改造消息的排序或分组逻辑（保持按时间线性排列）
- 不实现通用的"任意 MCP 工具调用后通知前端"机制，仅针对 `reconcile_app`
- 不改变 `SessionStore` 的数据库 schema（现有 `agent_messages` 表结构已足够）
- 不为 tool 消息实现 Markdown/代码高亮渲染

## Decisions

### D1: Assistant 消息即时持久化

**选择：** 在 `for-await` 循环内，每遇到 `assistant` 类型消息且包含非空文本内容时，立即调用 `store.addMessage()`。移除循环外的单次持久化逻辑。

**原因：** 当前 `assistantText` 变量在循环中被反复覆盖，只有最后一条被保存。一个 turn 中 Agent 可能多次交替产出文本和 tool 调用（text → tool_use → text → tool_use → text），中间的文本对用户理解上下文至关重要。

**过滤逻辑：** 仅持久化 `extractTextContent(msg.message.content)` 非空的 assistant 消息。纯 tool_use（无文本）的 assistant 消息不存储，避免空记录。

**替代方案：** 循环外收集所有 assistant 消息再批量存储——增加复杂度且无明显收益，不采用。

### D2: 工具消息可折叠 UI

**选择：** 重新设计 `ChatBubble` 中 tool 角色的渲染组件，采用可折叠卡片样式：

```
┌─────────────────────────────────────────┐
│ ▶ Write  ·  创建了 pages/home.tsx       │  ← 折叠态（默认）
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ ▼ Write                          done   │  ← 展开态
├─────────────────────────────────────────┤
│ 创建了 pages/home.tsx                    │
│                                         │
│ // 可选：展示更多 summary 细节           │
└─────────────────────────────────────────┘
```

- running 状态：显示旋转加载图标 + 工具名称
- done 状态：显示工具名称 + summary 摘要，可点击展开
- error 状态：红色边框 + 错误信息

**原因：** 类似 Claude Code 的体验，让用户知道 Agent 在做什么，同时不让大量工具调用淹没对话区域。默认折叠保持界面简洁。

### D3: 通过 EventBus 桥接 reconcile 通知

**选择：** 使用现有 `EventBus` 实现 `reconcile_app` 完成后的跨模块通知。

```
reconcile_app 完成
  │
  ▼
LocalBackend.reconcile()
  │ eventBus.emit('app:reconciled', { appSlug })
  ▼
ChatSession (监听 'app:reconciled')
  │ if (this.appSlug === event.appSlug)
  ▼
sendToWs({ type: 'app:reconciled', appSlug })
  │
  ▼
chat-store.ts
  │ case 'app:reconciled': → 触发回调
  ▼
AppLayout
  │ refreshApp() → 重新 fetch UI schema
  ▼
SchemaRenderer 重渲染
```

**原因：**

- `LocalBackend` 不持有 `ChatSessionManager` 引用，且二者的创建顺序存在依赖倒置（LocalBackend 先于 ChatSessionManager 构造）
- EventBus 是发布-订阅模式，天然解耦——`LocalBackend` 只管发事件，`ChatSession` 只管监听，互不依赖
- EventBus 已存在于 `core/event-bus.ts`，无需引入新依赖
- 未来其他需要响应 reconcile 的消费者可以直接订阅同一事件

**替代方案对比：**

| 方案 | 优点 | 缺点 |
|------|------|------|
| **EventBus（选用）** | 解耦、可扩展、零新依赖 | 需在 ChatSession 构造时注册监听 |
| 依赖注入 ChatSessionManager | 直接调用 | 需重构 server.ts 初始化顺序，增加耦合 |
| 轮询 | 零后端改动 | 延迟高、浪费资源 |

### D4: 前端 reconcile 事件处理链路

**选择：** `chat-store` 新增 `onReconciled` 回调注册能力。`AppLayout` 在 `useEffect` 中注册回调，回调内部调用 `refreshApp()`。

**原因：** `chat-store` 是 Zustand store，不宜直接引用 React 组件逻辑。通过回调注册的方式，保持 store 与 React 组件的解耦。`AppLayout` 已持有 `refreshApp()` 且负责管理 UI schema 状态，是触发刷新的合理位置。

## Risks / Trade-offs

**[助手消息判断逻辑]** → SDK 的 `assistant` 消息可能包含纯 `tool_use` 块而无文本，`extractTextContent` 返回空字符串时跳过持久化。需确认这不会漏掉用户需要看到的内容。缓解：`tool_use_summary` 已单独持久化，工具调用信息不会丢失。

**[EventBus 生命周期]** → ChatSession 需要在构造时订阅 EventBus，在 `shutdown()` 时取消订阅，避免内存泄漏。缓解：`eventBus.on()` 返回取消函数，在 `shutdown()` 中调用即可。

**[WebSocket 未连接时的 reconcile]** → `injectPrompt` 场景下浏览器尚未连接，`sendToWs` 会静默丢弃消息。此时刷新不生效，但用户连接后会通过 `chat:history` + 手动浏览恢复。缓解：这是可接受的行为——用户打开页面时 `useEffect` 已触发初始加载。

**[消息顺序依赖]** → 即时持久化依赖 SQLite 自增 ID 保证顺序。如果同一 turn 中 assistant 和 tool_use_summary 几乎同时到达，ID 自增保证了插入顺序。缓解：`for-await` 是顺序迭代，不存在并发写入问题。
