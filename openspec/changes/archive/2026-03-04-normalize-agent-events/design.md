## Context

当前 Agent 集成的数据流路径：

```
Claude Agent SDK
  │ query() → AsyncGenerator<SDKMessage>
  ▼
ChatSession.forwardSdkMessage()
  │ 过滤 user 类型，其余原样透传
  │ 同时从 assistant 消息中提取文本和 tool_use 块做持久化
  ▼
WebSocket → 浏览器
  │ JSON.parse
  ▼
chat-store.ts handleMessage()
  │ switch(msg.type) 分发处理 10+ 种消息类型
  │ 维护 streamBuffer / isAccumulating 追踪流式状态
  ▼
ChatPanel 渲染
```

关键约束：

- `chat-session.ts` 直接 import `query` / `Options` / `Query` / `SDKMessage` 等类型，与 `@anthropic-ai/claude-agent-sdk` 强绑定
- `sdk-mcp-server.ts` 使用 SDK 提供的 `createSdkMcpServer()` + `tool()` 注册 Cozybase 工具，这是 Claude SDK 特有的 in-process MCP 机制
- 前端 `chat-store.ts` 直接处理 Claude SDK 的原始消息格式（`stream_event`、`assistant`、`tool_use_summary` 等），包含深层嵌套解析
- `extract-app-info.ts` 也直接使用 `query()`，但用途是轻量 LLM 文本提取，与 coding agent 场景无关
- 现有 `CozybaseBackend` 接口 + `handlers.ts` 已经是厂商无关的——MCP 工具的定义和实现不受本次改造影响

## Goals / Non-Goals

**Goals:**

- 定义一套厂商无关的 Agent 事件格式（`AgentEvent`），覆盖消息、工具调用、运行状态和错误 4 个维度
- 定义 `AgentProvider` / `AgentQuery` 接口，封装 agent 查询生命周期（创建、流式迭代、取消、关闭、session 恢复）
- 实现 Claude Code provider，将 `SDKMessage` 流转换为 `AgentEvent` 流
- 改造 `ChatSession` 和 `chat-store.ts` 消费统一事件，消除对 Claude SDK 消息格式的直接依赖
- 规范化应用层 WebSocket 事件命名（`chat:*` → `session.*`）

**Non-Goals:**

- 不引入 Codex 或其他厂商的 provider 实现（本次只做 Claude Code）
- 不改造 `extract-app-info.ts`（纯文本提取场景，不走 agent 抽象层）
- 不改变 MCP 工具的定义和实现（`handlers.ts`、`mcp-types.ts` 保持不变）
- 不引入 provider 动态选择/配置机制（当前硬编码使用 Claude Code provider）
- 不改变 `SessionStore` 的数据库 schema
- 不改变 `ChatClient` (WebSocket 客户端) 的连接/重连逻辑

## Decisions

### D1: 新增 `packages/agent/` package

**选择：** 在 monorepo 中新增独立 package `packages/agent/`，包含事件类型定义和 provider 实现。

**目录结构：**

```
packages/agent/
├── package.json          # 依赖 @anthropic-ai/claude-agent-sdk, zod
├── tsconfig.json
└── src/
    ├── index.ts          # 公共 API: 类型 + Claude provider
    ├── types.ts          # AgentEvent, AgentQuery, AgentProvider, SessionEvent
    └── providers/
        └── claude-code.ts  # Claude SDK → AgentEvent 转换
```

**原因：**

- Agent 事件类型需要被 daemon（生产端）和 web（消费端）同时引用，独立 package 避免循环依赖
- provider 实现包含 SDK 依赖（`@anthropic-ai/claude-agent-sdk`），不应该污染其他 package
- 后续新增 Codex provider 时直接在 `providers/` 下添加，不影响现有代码

**替代方案：** 放在 `packages/daemon/src/agent/` 内部——前端无法直接引用类型定义（daemon 包含后端依赖），需要额外的类型导出方式，增加复杂度。

### D2: AgentEvent 类型系统

**选择：** 使用 `conversation.{category}.{lifecycle}` 的分层命名，所有事件通过 `type` 字段进行 discriminated union 区分。

```typescript
type AgentEvent =
  | { type: 'conversation.run.started' }
  | { type: 'conversation.run.completed'; sessionId: string }
  | { type: 'conversation.message.started'; messageId: string; role: 'assistant' | 'thinking' }
  | { type: 'conversation.message.delta'; messageId: string; role: 'assistant' | 'thinking'; delta: string }
  | { type: 'conversation.message.completed'; messageId: string; role: 'assistant' | 'thinking'; content: string }
  | { type: 'conversation.tool.started'; toolUseId: string; toolName: string }
  | { type: 'conversation.tool.progress'; toolUseId: string; toolName: string }
  | { type: 'conversation.tool.completed'; toolUseId: string; toolName: string; summary: string }
  | { type: 'conversation.notice'; message: string }
  | { type: 'conversation.error'; message: string }
```

每个 `message.*` 事件都携带 `role` 字段，消费端无需维护 `messageId → role` 的映射表。

**原因：**

- 分层命名提供清晰的语义分组，`switch` 时可按前缀快速过滤
- `messageId` 将 `started` / `delta` / `completed` 关联为一个消息的生命周期，前端可直接用 `messageId` 作为 index key 定位消息
- `role` 冗余传递到每个事件而非仅在 `started`，省去消费端的状态追踪

**替代方案：** 扁平命名（如 `text_delta`、`tool_start`）——语义弱，且与 Claude SDK 的命名风格过于接近，容易混淆。

### D3: AgentProvider / AgentQuery 接口

**选择：**

```typescript
interface AgentProvider {
  readonly name: string;
  createQuery(config: AgentQueryConfig): AgentQuery;
  isAvailable(): Promise<boolean>;
  dispose(): void;
}

interface AgentQuery extends AsyncIterable<AgentEvent> {
  interrupt(): Promise<void>;
  close(): void;
}

interface AgentQueryConfig {
  prompt: string;
  systemPrompt?: string;
  cwd: string;
  model?: string;
  resumeSessionId?: string;
  providerOptions?: unknown;   // 厂商特有配置（MCP server 等）
}
```

**关键设计点：**

- `AgentQuery` 继承 `AsyncIterable<AgentEvent>` 而非 `AsyncGenerator`，保持接口最小化——消费端只需 `for await`
- `providerOptions` 用于传递厂商特有配置（如 Claude 的 `mcpServers`、`tools`、`allowedTools` 等），类型为 `unknown`，provider 内部 assert
- `interrupt()` 和 `close()` 覆盖取消和清理两种需求

**原因：** 接口保持最小，只暴露消费端必需的操作。Claude SDK 的 `setModel()`、`rewindFiles()` 等高级控制方法不纳入通用接口——如果需要，消费端可通过 `providerOptions` 或直接访问 provider 实例。

### D4: Claude Provider 的 SDKMessage → AgentEvent 转换策略

**选择：** 在 provider 内部维护转换状态，将 Claude SDK 的复合消息拆解为独立事件。

**核心转换逻辑：**

```
SDKMessage                        AgentEvent(s)
───────────────────────────────── ─────────────────────────────────
system { init }                 → conversation.notice

stream_event { content_block_   → conversation.message.started   (首次)
  start, type: "text" }           { messageId: 自动生成 }

stream_event { content_block_   → conversation.message.delta
  delta, text_delta }             { messageId: 当前追踪, delta }

assistant                       → conversation.message.completed  (有文本时)
  { content: [text, tool_use] }   { messageId: 当前追踪, content: 拼合文本 }
                                → conversation.tool.started       (每个 tool_use 块)
                                  { toolUseId: block.id, toolName: block.name }

tool_progress                   → conversation.tool.progress
  { tool_use_id, tool_name }     { toolUseId, toolName }

tool_use_summary                → conversation.tool.completed
  { summary, preceding_ids }     { toolUseId: 首个 preceding id,
                                    toolName: 从内部 Map 查找,
                                    summary }

result { success }              → conversation.run.completed
                                  { sessionId: msg.session_id }

result { error }                → conversation.error
                                  { message: 拼合 errors }

user (resume 回放)              → (忽略，不转发)
```

**Provider 内部状态：**

- `messageCounter: number` — 自增生成 `messageId`（`m-1`, `m-2`, ...）
- `currentMessageId: string | null` — 追踪当前流式消息
- `toolUseMap: Map<string, string>` — `tool_use_id → tool_name` 映射（从 `assistant` 的 tool_use 块收集，供 `tool_use_summary` 查找）

**原因：** 这些状态（`toolUseMap`、流式消息追踪）本质上是 Claude SDK 适配的实现细节，从 `ChatSession` 下沉到 provider 内部是正确的分层——`ChatSession` 只看到干净的 `AgentEvent` 流。

### D5: Session Events 规范化

**选择：** 应用层事件重命名为 `session.*`，payload 保持不变。

```
chat:status   → session.connected  { hasSession, streaming }
chat:history  → session.history    { messages: StoredMessage[] }
chat:error    → session.error      { message: string }
app:reconciled → session.reconciled { appSlug: string }
```

`chat:streaming` 被消除——前端从 `conversation.run.started`（设 `streaming = true`）和 `conversation.run.completed`（设 `streaming = false`）推导该状态。初始 streaming 状态从 `session.connected.streaming` 获取。

**原因：** 统一命名规范，消除 `chat:` 前缀和 `app:` 前缀的混杂。`SessionEvent` 类型定义在 `packages/agent/src/types.ts` 中，daemon 和 web 共享同一份类型。

### D6: MCP 工具服务器的归属

**选择：** `createSdkMcpServer()` 的调用保留在 `packages/daemon/` 中，创建好的 config 通过 `providerOptions` 传入 provider。

```typescript
// daemon/src/index.ts (初始化时)
const mcpServer = createCozybaseSdkMcpServer(handlerContext);  // 保留在 daemon

// daemon/src/agent/chat-session.ts (创建查询时)
agentProvider.createQuery({
  prompt: text,
  cwd: agentDir,
  systemPrompt: buildSystemPrompt(appSlug),
  resumeSessionId: this.sdkSessionId,
  providerOptions: {                   // Claude 特有配置
    mcpServers: { cozybase: mcpServer },
    tools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
    allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'mcp__cozybase__*'],
  },
});
```

**原因：**

- `createCozybaseSdkMcpServer()` 依赖 `HandlerContext`（包含 `CozybaseBackend`、`appsDir`），这些是 daemon 的核心设施，不应被 `packages/agent/` 依赖
- `sdk-mcp-server.ts` 使用的 `createSdkMcpServer` 和 `tool` 函数虽然来自 Claude SDK，但它们本质上是 MCP 工具注册，与 agent 事件抽象无关
- 当后续引入 Codex provider 时，MCP 工具的注册方式完全不同（stdio server），不能在 agent package 中统一

**替代方案：** 将 `sdk-mcp-server.ts` 移入 `packages/agent/providers/`——会引入对 daemon handlers 的依赖，破坏 package 边界。

### D7: `extract-app-info.ts` 不纳入抽象

**选择：** `extract-app-info.ts` 保持直接使用 `query()`，不走 agent provider。

**原因：**

- 该函数是纯文本提取，使用 Haiku 模型，不注册任何工具，不需要流式事件
- 它的调用模式是"发 prompt → 等完整结果"，与 coding agent 的"流式交互 + 工具调用"模式完全不同
- 为它套 agent 抽象层是过度设计——后续如果引入通用 LLM client 层（如 pi-mono）可以再迁移

## Risks / Trade-offs

**[stream_event 检测 message.started 的时机]** → Claude SDK 的 `stream_event` 包含 `content_block_start` 和 `content_block_delta` 两种子事件。Provider 需要在 `content_block_start` 且 type 为 `text` 时发出 `conversation.message.started`。如果 SDK 版本升级改变了 streaming 事件结构，此处可能需要更新。缓解：转换逻辑集中在一个文件中，维护成本可控。

**[toolUseMap 一致性]** → `tool_use_summary` 的 `preceding_tool_use_ids` 可能包含多个 ID（一次 assistant 消息中有多个 tool_use 块）。当前设计取首个 ID 的 toolName。缓解：与现有 `chat-session.ts` 的行为一致，且实际场景中 summary 通常对应单个工具。

**[前后端同步部署]** → WebSocket 消息格式是 breaking change（`chat:*` → `session.*`，SDK 原始消息 → `conversation.*`）。缓解：Cozybase 是本地运行的单体应用，前后端从同一份构建产物部署，不存在版本不一致的问题。

**[类型共享方式]** → `packages/agent/src/types.ts` 需要被 daemon 和 web 同时引用。web 通过 monorepo workspace 引用 `@cozybase/agent` 即可获取类型。但 web 构建时不能打包 provider 实现（其中包含 Node.js 依赖）。缓解：web 只 import `types.ts` 中的 type-only 导出，不引入运行时代码；或将类型定义单独发布为 subpath export。
