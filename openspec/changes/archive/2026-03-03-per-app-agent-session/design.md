## Context

当前 AI Agent 基础设施由以下组件构成：

- `ChatService`（`packages/daemon/src/agent/chat-service.ts`）：单例，管理唯一一个 Claude SDK session，通过 WebSocket 与浏览器通信
- `LocalBackend`（`packages/daemon/src/agent/local-backend.ts`）：无状态代理层，直接调用 Workspace / AppManager 等核心服务
- `createCozybaseSdkMcpServer`（`packages/daemon/src/agent/sdk-mcp-server.ts`）：注册所有 MCP 工具的 SDK MCP Server
- `COZYBASE_SYSTEM_PROMPT`（`packages/daemon/src/agent/system-prompt.ts`）：静态 system prompt
- `ChatClient` + `useChatStore`（前端）：全局单例 WebSocket 客户端 + Zustand store

整体拓扑：

```
Browser ──WebSocket──▶ Daemon (单个 ChatService) ──Claude SDK──▶ Claude API
                              │
                              └── MCP Server (LocalBackend)
                                     │
                                     ├── AppManager
                                     ├── DraftReconciler
                                     ├── Verifier
                                     └── Publisher
```

前端已完成 Home / Builder 模式拆分：`/stable` 为 Home 模式，`/draft` 为 Builder 模式。前端路由中 `appName` 已经作为 URL 参数存在（`/draft/apps/:appName/*`），但这个信息没有传递到 Agent 层。

约束条件：

- `platform.sqlite` 是唯一的元数据存储，使用 Bun SQLite（同步 API）
- 数据库 schema 演进使用 conditional `ALTER TABLE`（检查 column 是否存在再添加），不使用迁移框架
- Claude Agent SDK 的 `query()` API 支持 `resume: sessionId` 恢复多轮对话
- WebSocket 使用 Bun 原生 `server.upgrade()`，通过 `ws.data` 区分连接类型

## Goals / Non-Goals

**Goals:**

- 每个 APP 拥有独立的 AI Agent session，APP 之间的对话上下文完全隔离
- session 数据（SDK session ID + 消息历史）持久化到 `platform.sqlite`，进程重启后可恢复
- Agent 自动感知当前正在编辑的 APP，无需用户手动告知
- 前端 APP 切换时自动切换到对应 session 的 WebSocket 连接，并恢复历史消息
- Home 模式保留 ChatPanel UI 框架但不提供功能

**Non-Goals:**

- 不实现全局 session（Builder 列表页的 AI 创建 APP 功能）
- 不实现 Home 模式的 AI 功能
- 不处理多用户 / 多 tab 并发冲突
- 不实现消息历史清空、导出、搜索
- 不实现 SDK session 过期的平滑降级

## Decisions

### 1. 持久化存储：platform.sqlite 新增两张表

**选择**：在 `platform.sqlite` 中新增 `agent_sessions` 和 `agent_messages` 两张表。

**替代方案**：
- (A) 每个 APP 一个 JSON 文件（如 `workspace/agent/sessions/<app>.json`）—— 无事务保证，删除/重命名 APP 时需要手动同步文件
- (B) 每个 APP 一个 SQLite 文件 —— 过度分散，增加连接管理复杂度

**理由**：`platform.sqlite` 已经是 `apps`、`app_files`、`api_keys` 的存储中心，session 是 APP 维度的元数据。使用同一个数据库可以复用现有的 `ON DELETE CASCADE` 外键机制，APP 删除时 session 数据自动清理。

**Schema 设计**：

```sql
CREATE TABLE IF NOT EXISTS agent_sessions (
  app_name TEXT PRIMARY KEY REFERENCES apps(name) ON DELETE CASCADE,
  sdk_session_id TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
  role TEXT NOT NULL,          -- 'user' | 'assistant' | 'tool'
  content TEXT NOT NULL DEFAULT '',
  tool_name TEXT,              -- role='tool' 时的工具名
  tool_status TEXT,            -- 'running' | 'done' | 'error'
  tool_summary TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_app
  ON agent_messages(app_name, id);
```

Schema 初始化沿用现有的 conditional 模式：在 `Workspace.initPlatformSchema()` 末尾追加 `CREATE TABLE IF NOT EXISTS`，确保兼容已有数据库。

### 2. 后端架构：ChatSession + ChatSessionManager + SessionStore 三层拆分

**选择**：将当前的单例 `ChatService` 拆分为三个职责清晰的类。

```
ChatSessionManager          SessionStore              ChatSession
(会话路由 + 生命周期)       (持久化)                  (单个 APP 的会话逻辑)
┌─────────────────┐        ┌──────────────────┐      ┌──────────────────────┐
│ sessions: Map   │        │ db: Database     │      │ appName: string      │
│                 │        │                  │      │ sdkSessionId: string │
│ getOrCreate()   │───────▶│ getSession()     │◀─────│ ws: WebSocket        │
│ get()           │        │ saveSessionId()  │      │ streaming: boolean   │
│ remove()        │        │ getMessages()    │      │ store: SessionStore  │
│ shutdown()      │        │ addMessage()     │      │                      │
└─────────────────┘        │ clearMessages()  │      │ connect()            │
                           └──────────────────┘      │ handleMessage()      │
                                                     │ disconnect()         │
                                                     │ shutdown()           │
                                                     └──────────────────────┘
```

**理由**：
- `ChatSession` 保留 `ChatService` 的核心逻辑（SDK query、WebSocket 消息转发），但绑定到具体的 `appName`
- `ChatSessionManager` 负责 session 的创建、复用和清理，是 `server.ts` 和 `index.ts` 的唯一交互点
- `SessionStore` 封装所有 DB 操作，便于测试和后续替换存储后端

`ChatSessionManager` 不会预加载所有 session，而是按需 lazy 创建：只有当 WebSocket 连接到达时才创建 `ChatSession` 实例。

### 3. WebSocket 路由：URL query param 传递 appName

**选择**：`/api/v1/chat/ws?app=<appName>`

**替代方案**：
- (A) 路径参数 `/api/v1/chat/ws/<appName>` —— Bun 的 `server.upgrade()` 发生在 Hono 路由之外（在 `fetch` 回调中），路径参数需要手动解析，query param 更简单
- (B) 连接后通过 WebSocket 消息发送 appName —— 需要额外的握手协议，增加复杂度

**理由**：query param 在 `new URL(req.url)` 中直接可用，且不影响 Hono 路由匹配。Bun WebSocket `upgrade()` 时通过 `data` 字段传递 `appName`，后续 `open` / `message` / `close` 回调中直接从 `ws.data.appName` 获取。

**拒绝无 `app` 参数的连接**：如果 URL 中没有 `app` 参数，返回 HTTP 400。这与"纯 APP session"的决策一致。

### 4. System Prompt 动态注入 APP 上下文

**选择**：`buildSystemPrompt(appName)` 在基础 prompt 后追加 APP 上下文段落。

**设计**：

```
基础 prompt（保持不变）
+
## Current Context
You are working on the app "<appName>".
- All tool calls should target app_name="<appName>" unless explicitly asked otherwise
- Proactively call `fetch_app` with this app name at the start of a conversation
```

**理由**：让 Agent 在收到第一条消息时就知道自己在编辑哪个 APP，避免多余的 `list_apps` → "你想编辑哪个？" 交互。`appName` 在每个 `ChatSession` 创建时确定，不会在 session 生命周期内变化。

### 5. 消息持久化粒度：仅存展示级摘要

**选择**：只持久化前端需要展示的三种消息类型：
- `user` 消息：完整文本
- `assistant` 消息：完整最终文本（不含 streaming delta）
- `tool` 消息：工具名 + 状态 + 摘要

**不持久化的内容**：
- SDK streaming delta（`stream_event` / `content_block_delta`）
- 完整的 tool input/output
- SDK 内部消息（`system` 类型）

**理由**：
- Claude SDK 的 `resume` 机制已经能恢复完整的对话上下文（包括 tool 调用历史），不需要我们自行重建
- 持久化的消息只用于前端 UI 展示历史，不需要传给 SDK
- 仅存摘要可以大幅减少存储量

**消息写入时机**：
- `user` 消息：在 `handleUserMessage` 入口处立即写入
- `assistant` 消息：在 SDK `type: 'result'` 消息到达后写入最终文本
- `tool` 消息：在 `tool_use_summary` 到达时写入

### 6. 前端 WebSocket 生命周期：APP 切换触发重连

**选择**：`setActiveApp(appName)` 时执行「断开 → 清空 → 重连」序列。

**流程**：

```
setActiveApp("new-app")
  │
  ├── 1. client.disconnect()         // 关闭旧 WebSocket
  ├── 2. set({ messages: [] })        // 清空本地消息
  ├── 3. client = new ChatClient(     // 创建新 WebSocket
  │        getChatWsUrl("new-app"))
  └── 4. client.connect()            // 建立连接
         │
         └── 服务端推送 chat:history  // 恢复历史消息
```

**替代方案**：维护多个并行 WebSocket 连接（每个 APP 一个）—— 浪费资源，用户同一时间只会看一个 APP 的聊天。

**`setActiveApp(null)` 的行为**：断开 WebSocket，清空消息，不重连。此状态对应 Home 模式或 Builder 列表页。

### 7. `chat:history` 消息协议设计

**选择**：WebSocket 连接建立后，服务端主动推送一条 `chat:history` 消息。

**消息格式**：

```json
{
  "type": "chat:history",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." },
    { "role": "tool", "toolName": "create_app", "status": "done", "summary": "..." }
  ]
}
```

**理由**：将历史恢复放在服务端而非客户端（frontend 调用 REST API 获取历史），好处是：
- 与 `chat:status` 走同一个 WebSocket 通道，保证消息顺序
- 不需要额外的 REST endpoint
- 客户端逻辑简单：收到 `chat:history` 时直接替换 `messages` 数组

**消息数量限制**：默认加载最近 100 条消息。过早的消息对用户价值不大，且加载过多会拖慢 WebSocket 连接建立。

### 8. APP 删除/重命名时的 session 连带操作

**删除 APP**：
- DB 层：`ON DELETE CASCADE` 自动清理 `agent_sessions` + `agent_messages`
- 内存层：`AppManager.delete()` 中调用 `chatSessionManager.remove(appName)` 关闭内存中的 `ChatSession`（如果有活跃的 WebSocket，会收到 close 事件）

**重命名 APP**：
- `AppManager.rename()` 已有的事务中新增：`UPDATE agent_sessions SET app_name = ? WHERE app_name = ?` 和 `UPDATE agent_messages SET app_name = ? WHERE app_name = ?`
- 内存层：rename 完成后调用 `chatSessionManager.remove(oldName)`（用户需要重新进入新名称的 APP 页面来建立连接）

## Risks / Trade-offs

**[SDK resume 失败]** → SDK session 有时效或大小限制，resume 可能失败。Mitigation：在 `handleUserMessage` 的 catch 中检测 resume 相关错误，清除旧 `sdkSessionId`，开始新 session。消息历史保留在 UI 上（仅丢失 Claude 端的上下文记忆），不影响用户继续操作。

**[消息历史膨胀]** → 长时间使用的 APP 会积累大量消息。Mitigation：`chat:history` 加载时限制最近 100 条；后续可增加清空消息的功能（当前不在范围内）。

**[WebSocket 重连开销]** → 每次 APP 切换都需要断开旧连接、建立新连接。Mitigation：WebSocket 握手开销极小（毫秒级），且用户切换 APP 的频率不高。比维护多个并行连接的资源开销更合理。

**[前后端同步部署]** → WebSocket URL 从 `/api/v1/chat/ws` 变为 `/api/v1/chat/ws?app=xxx`，旧前端连新后端会被 400 拒绝。Mitigation：这是本地单机部署项目，前后端从同一个 daemon 服务，不存在版本不一致的问题。

**[platform.sqlite 表膨胀]** → 消息数据量会比其他表大很多。Mitigation：消息只存摘要文本，单条消息平均几百字节。即使 10 个 APP 各 1000 条消息，总量也只有几 MB，远低于 SQLite 的性能边界。

## Open Questions

暂无。所有关键设计决策已在 explore 阶段确认。
