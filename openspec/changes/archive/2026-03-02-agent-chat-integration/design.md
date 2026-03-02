## Context

当前 Cozybase 的 MCP 工具通过 stdio transport 暴露给外部 CLI Agent，工具 handler 通过 `RemoteBackend`（HTTP 调用 daemon API）执行操作。Admin UI 的 Chat Panel 是静态占位组件，无法与 AI 交互。

现有 WebSocket 基础设施仅用于 Agent ↔ Browser 的 UI Inspection 桥接（`/api/v1/agent/ws`），由 `UiBridge` 管理。Bun 的 `Bun.serve()` 只允许一个 `websocket` handler 对象处理所有 WebSocket 连接。

## Goals / Non-Goals

**Goals:**
- 用户在 Admin UI Chat Window 中与 AI Agent 进行多轮自然语言对话
- Agent 能调用 Cozybase MCP 工具（创建/修改/发布 App 等）
- Agent 能使用内建工具（Bash, Read, Edit）操作 workspace 中的文件
- 对话内容实时流式显示（打字效果 + 工具执行状态）

**Non-Goals:**
- 多并发会话（MVP 仅单 session）
- 聊天历史持久化（依赖 SDK 内置机制）
- 前端 App 列表自动刷新
- Codex SDK 集成
- 上下文感知注入

## Decisions

### 1. 新增 `LocalBackend` 实现 `CozybaseBackend` 接口

**选择:** 创建 `LocalBackend` 类，直接调用 `Workspace` / `DraftReconciler` / `Verifier` / `Publisher` 等核心对象，而非通过 HTTP。

**替代方案:** 复用 `RemoteBackend` 让 SDK MCP Server 通过 HTTP 回调 daemon。

**理由:** `RemoteBackend` 需要 daemon HTTP 服务可用（回环调用），且有序列化/反序列化开销。`LocalBackend` 在同进程内直接调用，零网络开销，代码路径更短。同时，现有 handler 函数（`handleCreateApp` 等）已经只依赖 `CozybaseBackend` 接口和 `appsDir`，`LocalBackend` 只需实现同一接口即可无缝替换。

```
现有:  MCP Server (stdio) → RemoteBackend → HTTP → daemon → Workspace
新增:  SDK MCP Server (in-process) → LocalBackend → Workspace (直接调用)
```

`LocalBackend` 需要持有的依赖：
- `Workspace` — App 管理、文件操作
- `DraftReconciler` — Draft 重建
- `Verifier` — 发布前验证
- `Publisher` — 发布到 Stable
- `AppRegistry` (from Runtime) — 启停 App、重启 Draft/Stable
- `UiBridge` — UI Inspection 转发

### 2. 使用 `createSdkMcpServer()` 注册进程内 MCP 工具

**选择:** 使用 Claude Agent SDK 的 `createSdkMcpServer()` + `tool()` 辅助函数定义工具。

**理由:** 这是 SDK 原生支持的 in-process MCP server 方式。工具 handler 在 daemon 进程内执行，Claude subprocess 通过 MCP protocol 调用。避免 spawn 额外 MCP subprocess。

工具注册模式：

```typescript
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';

const mcpServer = createSdkMcpServer({
  name: 'cozybase',
  tools: [
    tool('create_app', TOOL_DESCRIPTIONS.create_app,
      { name: z.string(), description: z.string().optional() },
      async (args) => {
        const result = await handleCreateApp(handlerCtx, args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      }
    ),
    // ... 其他工具
  ]
});
```

复用现有的：
- `TOOL_DESCRIPTIONS` — 工具描述文案
- `handle*` 函数 — 核心 handler 逻辑
- Zod schemas — 输入验证

### 3. 使用 `unstable_v2_createSession()` 管理多轮对话

**选择:** 使用 V2 Session API 而非 V1 `query()` API。

**替代方案:** V1 `query()` API 需要将 `AsyncIterable<SDKUserMessage>` 作为 prompt 参数传入来实现多轮对话，模式较复杂。

**理由:** V2 Session API 提供 `send()` / `stream()` / `close()` 方法，天然适合 Chat Window 的交互模式。支持 session resume。

### 4. WebSocket 连接多路复用

**选择:** 复用 Bun 的单一 `websocket` handler，通过 upgrade 时附加 `data.type` 区分连接类型。

**理由:** Bun.serve() 只允许一个 `websocket` handler 对象。需要在 `fetch` 中对不同路径做 upgrade，在 `websocket.open/message/close` 中按 `ws.data.type` 分发。

```typescript
// fetch handler
if (url.pathname === '/api/v1/agent/ws') {
  server.upgrade(req, { data: { type: 'agent-bridge' } });
}
if (url.pathname === '/api/v1/chat/ws') {
  server.upgrade(req, { data: { type: 'chat' } });
}

// websocket handler
open(ws) {
  if (ws.data.type === 'agent-bridge') uiBridge.addSession(ws);
  if (ws.data.type === 'chat') chatService.connect(ws);
}
```

### 5. Agent 工作目录

**选择:** 在 workspace 根目录下创建 `agent/` 目录作为 Agent 的 CWD 和 `appsDir`。

**理由:** Agent 需要一个文件系统目录来执行 `fetch_app`（下载文件到本地）和 `update_app_file`（从本地读取文件推送到 daemon）。这个目录逻辑上等价于外部 CLI Agent 使用 `cozybase init` 创建的工作目录。

```
workspace/
├── platform.sqlite
├── stable/
├── draft/
├── workspace.yaml
└── agent/          ← Agent 的工作目录 (CWD + appsDir)
    └── apps/       ← 各 APP 的本地文件副本
        ├── todo-app/
        │   ├── migrations/
        │   ├── functions/
        │   └── ui/
        └── ...
```

`unstable_v2_createSession()` 的 `cwd` 设为此目录，使 Claude 的内建工具（Bash, Read, Edit）在此范围内操作。

### 6. ChatService 设计

`ChatService` 是核心编排层，职责：

- 管理 `SDKSession` 的生命周期（创建 / 销毁）
- 桥接 Browser WebSocket 和 SDK 消息流
- 转发 `SDKMessage` 到浏览器（按类型过滤/转换）

```
Browser WebSocket          ChatService              SDK Session
     │                        │                         │
     │── chat:send ──────────▶│                         │
     │                        │── session.send() ──────▶│
     │                        │                         │── Claude API
     │                        │                         │── tool calls
     │                        │◀── stream() yields ─────│
     │◀── SDKMessage ─────────│                         │
     │                        │                         │
     │── chat:cancel ────────▶│                         │
     │                        │── session.close() ─────▶│
```

关键行为：
- 浏览器连接时，如果没有活跃 session 则创建新 session
- 浏览器断开时，session 保持存活（不销毁），下次连接可 resume
- `stream()` 循环在后台运行，持续将 Agent 输出推送到浏览器
- 收到 `chat:cancel` 时终止当前 Agent 执行

SDK Session 配置：
```typescript
{
  model: 'claude-sonnet-4-6',
  permissionMode: 'acceptEdits',
  allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
  mcpServers: { cozybase: sdkMcpServer },
  cwd: agentDir,
  systemPrompt: COZYBASE_SYSTEM_PROMPT,
}
```

### 7. 前端消息类型映射

浏览器收到的 `SDKMessage` 按 `type` 字段渲染不同 UI 元素：

| SDK Message Type | 前端渲染 |
|---|---|
| `stream_event` (`content_block_delta`) | 实时追加文本（打字效果） |
| `assistant` | 完整消息气泡（markdown 渲染） |
| `tool_progress` | 工具执行指示器（名称 + 耗时） |
| `tool_use_summary` | 工具结果摘要 |
| `result` (success) | 对话回合结束 |
| `result` (error) | 错误提示 |
| `system` (`task_started`) | 子任务开始 |
| `system` (`task_notification`) | 子任务完成 |

前端发送的消息类型：
- `{ type: "chat:send", message: string }` — 发送用户消息
- `{ type: "chat:cancel" }` — 取消当前 Agent 执行

## Risks / Trade-offs

**[`unstable_v2_createSession` 是 unstable API]** → SDK 版本升级时可能有 breaking change。通过锁定 SDK 版本 + 将 session 创建逻辑集中在 `ChatService` 内来降低影响范围。

**[Claude subprocess 的 CWD 有文件系统访问权限]** → Agent 可以通过 Bash/Edit 工具修改 workspace 中的任意文件。MVP 阶段通过 `permissionMode: 'acceptEdits'` 和 `allowedTools` 白名单控制。后续可通过 hooks 或 `canUseTool` 回调进一步限制。

**[单 session 限制]** → 多个浏览器同时连接到 `/api/v1/chat/ws` 时，只有一个能与 Agent 交互。MVP 可接受，后续扩展为多 session。

**[SDK 依赖全局 `claude` CLI]** → `@anthropic-ai/claude-agent-sdk` 底层需要 Claude Code CLI。MVP 阶段假设用户已安装。后续可在 daemon 启动时检测并给出提示。

**[in-process SDK MCP Server 的工具执行阻塞]** → 某些工具（如 `publish_app`）可能耗时较长，会阻塞 Agent 对话流。但这是预期行为（Agent 等待工具完成），不会阻塞 daemon 的 HTTP 服务（Bun 的事件循环分离）。
