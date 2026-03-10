## Context

本 change 依赖 `cozybase-agent` change 提供的 CozyBase Agent 基础设施。

CozyBase Agent 是一个平台级核心 Agent（已实现），拥有跨 APP 的意图理解和委派能力。它通过 WebSocket 端点 `/api/v1/cozybase/ws` 暴露。

CozyBase Agent 的 WebSocket 协议：
- 入站消息类型：`chat:send`（发送 prompt）、`chat:cancel`（取消）、`prompt`（简化的 prompt 发送）
- 出站事件类型：`conversation.*`（Agent 事件）和 `session.*`（Session 事件）
- Agent 事件：`conversation.run.started`、`conversation.message.started`、`conversation.message.delta`、`conversation.message.completed`、`conversation.tool.started`、`conversation.tool.progress`、`conversation.tool.completed`、`conversation.run.completed`、`conversation.error`、`conversation.notice`
- Session 事件：`session.connected`、`session.history`、`session.error`

ACP (Agent Client Protocol) 是一个标准化协议，定义了 Client 与 Agent 之间的通信方式：
- JSON-RPC 2.0 over stdio（newline-delimited）
- 单连接多 session
- Client 发送 `session/prompt`，Agent 通过 `session/update` 流式返回进度
- 支持 tool_call、agent_message_chunk、plan 等通知类型

本 change 的核心工作是**协议适配**：将 ACP JSON-RPC 消息转换为 Cozybase WebSocket 消息，将 Cozybase 的 `conversation.*` 事件转换为 ACP `session/update` 通知。不涉及任何业务逻辑——业务理解和 APP 路由完全由 CozyBase Agent 负责。

## Goals / Non-Goals

**Goals:**
- 实现 ACP 协议的 stdio 传输层，使 Cozybase 可以作为标准 ACP Agent 被 OpenClaw 或其他 ACP Client 调用
- ACP session 桥接到 CozyBase Agent 的 WebSocket 端点，复用完整的意图理解、APP 路由和委派能力
- 将 `conversation.*` 事件流正确映射为 ACP `session/update` 通知
- 支持 session 创建、prompt 处理、cancel
- 提供 OpenClaw 侧的 ACP backend 配置说明

**Non-Goals:**
- 不实现 ACP Client（Cozybase 只作为 Agent 端）
- 不实现 Streamable HTTP 传输（ACP 标准中标记为 draft，stdio 已足够）
- 不实现 ACP 的 `fs/*` 和 `terminal/*` Client 方法（CozyBase Agent 内部已有完整能力）
- 不实现 `session/request_permission`（Phase 1 不做权限审批）
- 不实现 `session/load`（Phase 1 不做 session 恢复，后续可加）
- 不处理多用户隔离

## Decisions

### Decision 1: ACP session 桥接到 CozyBase Agent，而非 per-app Builder session

**选择：** `cozybase acp` 进程启动后，通过 WebSocket 连接 daemon 的 `/api/v1/cozybase/ws`（CozyBase Agent 端点），不连接 per-app 的 `/api/v1/chat/ws?app={slug}`。

```
OpenClaw → ACP stdio → cozybase acp → WS /api/v1/cozybase/ws → CozyBase Agent
                                                                    │
                                                              意图理解 + 路由
                                                                    │
                                                         Builder / Operator sessions
```

**原因：**
- ACP Client（OpenClaw）无法在 session 创建时指定 appSlug
- CozyBase Agent 负责所有业务逻辑：理解意图、选择 APP、委派执行
- ACP 层只做纯粹的协议转换，保持极简

**替代方案：** ACP 层自己做 APP 路由。但这会在 ACP 层引入业务逻辑，且与 CozyBase Agent 的职责重叠。

### Decision 2: ACP Server 作为独立进程

**选择：** `cozybase acp` 启动一个独立进程，通过 WebSocket 连接已运行的 daemon。

```
OpenClaw Gateway
    │
    └── spawn: cozybase acp --workspace ~/.cozybase
                    │
                    ├── stdin/stdout: ACP JSON-RPC
                    │
                    └── WebSocket: connect to daemon /api/v1/cozybase/ws
```

**原因：** ACP 要求 stdio 传输，daemon 是 HTTP server。独立进程分离职责，复用 `cozybase mcp` 的 daemon 发现逻辑（PID file + port file 自动发现）。

**调研结论：** OpenClaw 的 acpx 只支持 stdio 传输（spawn 子进程），不支持 HTTP 或连接已有进程。因此独立进程是唯一可行方式。acpx 支持自定义 Agent 注册：

```json
// ~/.acpx/config.json
{
  "agents": {
    "cozybase": {
      "command": "cozybase acp --workspace ~/.cozybase"
    }
  }
}
```

### Decision 3: 事件映射方案

**选择：** 将 CozyBase Agent session 的出站事件映射为 ACP `session/update` 通知。完整映射表如下：

**Agent 事件映射：**

| Cozybase Event | ACP 映射 | 说明 |
|---|---|---|
| `conversation.run.started` | （内部状态）不发送 ACP 通知 | 标记 prompt 开始处理 |
| `conversation.message.started` | `agent_message_chunk` (初始) | 含 messageId、role |
| `conversation.message.delta` | `agent_message_chunk` + text content | 流式文本块 |
| `conversation.message.completed` | `agent_message_chunk` + final text | 完整文本，标记消息结束 |
| `conversation.tool.started` | `tool_call` (status: pending) | 含 toolUseId、toolName |
| `conversation.tool.progress` | `tool_call_update` (status: in_progress) | |
| `conversation.tool.completed` | `tool_call_update` (status: completed, content) | 含结果摘要 |
| `conversation.run.completed` | prompt 方法返回 result (stopReason: end_turn) | 一轮对话结束 |
| `conversation.error` | prompt 方法返回 error | Agent 执行错误 |
| `conversation.notice` | `agent_message_chunk` | 系统通知（如异步任务完成）|

**Session 事件处理：**

| Cozybase Event | ACP 映射 | 说明 |
|---|---|---|
| `session.connected` | 内部状态，不映射 | 连接建立确认 |
| `session.history` | Phase 1 不映射（Non-Goal: 不实现 session/load） | 历史消息恢复 |
| `session.error` | ACP 标准错误响应 | Session 级别错误 |

CozyBase Agent 的工具集简单（~8 个高层工具），tool kind 映射：

| CozyBase Agent tool | ACP kind |
|---|---|
| `list_apps`, `get_app_detail` | read |
| `create_app`, `develop_app` | execute |
| `operate_app` | execute |
| `start_app`, `stop_app` | execute |
| `delete_app` | delete |

### Decision 4: 使用 `@agentclientprotocol/sdk`

**选择：** 使用官方 TypeScript SDK 的 `AgentSideConnection` 处理 ACP 协议细节。

```typescript
import { AgentSideConnection } from '@agentclientprotocol/sdk';

const connection = new AgentSideConnection(transport);
connection.onInitialize((params) => { ... });
connection.onSessionNew((params) => { ... });
connection.onSessionPrompt((params) => { ... });
```

**原因：** 避免手动实现 JSON-RPC 2.0 解析和 ACP 消息序列化。

**回退方案：** 如果 SDK 不稳定或 API 不满足需求，可直接基于 ndjson（newline-delimited JSON）手动实现 JSON-RPC 2.0。ACP 的协议本身并不复杂——核心只有 initialize、session/new、session/prompt、session/cancel 四个方法 + session/update 通知。手动实现的工作量可控。

**评估标准：** 实现前先检查 `@agentclientprotocol/sdk` 的 npm 下载量、最近更新时间、TypeScript 类型完整性。如果包半年以上未更新或类型覆盖不全，则直接手动实现。

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      OpenClaw Gateway                         │
│                                                               │
│  Telegram → │                                                 │
│  Discord  → │→ Multi-Agent Router → ACP Backend: cozybase    │
│  Slack    → │                                                 │
└──────────────┬───────────────────────────────────────────────┘
               │ spawn process
               ▼
┌──────────────────────────────────────────────────────────────┐
│              cozybase acp --workspace ~/.cozybase             │
│                                                               │
│  ┌──────────────┐       ┌──────────────────────────┐         │
│  │ ACP Protocol │       │ Daemon Bridge            │         │
│  │ Handler      │       │                          │         │
│  │              │       │ WebSocket connection to   │         │
│  │ stdin  ──→ ──┤       │ /api/v1/cozybase/ws      │         │
│  │ stdout ←── ──┤       │                          │         │
│  └──────────────┘       └──────────────────────────┘         │
│         │                          │                          │
│         │  JSON-RPC                │  conversation.*          │
└─────────┼──────────────────────────┼──────────────────────────┘
          │                          │
          ▼                          ▼
   ACP Client                Cozybase Daemon
   (OpenClaw)                ├── CozyBase Agent Session
                             │   ├── list_apps, create_app, ...
                             │   ├── develop_app → Builder Session
                             │   └── operate_app → Operator Session
                             └── Agent Runtime (Claude/Codex)
```

### 模块结构

```
packages/daemon/src/acp/
├── acp-entry.ts           # CLI 入口，解析参数，连接 daemon
├── acp-server.ts          # ACP 协议 handler + WebSocket bridge
├── event-mapper.ts        # conversation.* → ACP session/update
└── types.ts               # ACP 协议类型 (或从 SDK 导入)
```

### 数据流

```
1. OpenClaw spawn: cozybase acp --workspace ~/.cozybase

2. 初始化：
   OpenClaw → initialize { protocolVersion, clientCapabilities }
   ACP Server → { protocolVersion, agentCapabilities: { loadSession: false } }

3. 创建 Session：
   OpenClaw → session/new { cwd: "~/.cozybase" }
   ACP Server → 建立 WebSocket 到 daemon /api/v1/cozybase/ws
   ACP Server → { sessionId: "sess_xxx" }

4. 用户 Prompt：
   OpenClaw → session/prompt { prompt: [{ type: "text", text: "帮我做一个记账 APP" }] }
   ACP Server → WS send { type: 'chat:send', message: "帮我做一个记账 APP" }
   daemon CozyBase Agent → 调用 create_app → Builder 后台工作
   daemon → conversation.run.started → ACP（内部状态，不转发）
   daemon → conversation.message.started → ACP → session/update { agent_message_chunk }
   daemon → conversation.message.delta → ACP → session/update { agent_message_chunk }
   daemon → conversation.tool.started → ACP → session/update { tool_call }
   daemon → conversation.tool.completed → ACP → session/update { tool_call_update }
   daemon → conversation.message.completed → ACP → session/update { agent_message_chunk }
   daemon → conversation.run.completed → ACP → prompt result { stopReason: end_turn }

5. Cancel：
   OpenClaw → session/cancel { sessionId }
   ACP Server → WS send { type: 'chat:cancel' }
```

## Risks / Trade-offs

**[ACP 协议版本变动] → 锁定 SDK 版本**
ACP 目前处于早期阶段。锁定 `@agentclientprotocol/sdk` 版本，定期升级。

**[daemon 未启动] → 清晰错误报告**
复用 `cozybase mcp` 的 daemon 发现逻辑。daemon 不可用时，返回 ACP 协议的标准错误响应。

**[WebSocket 断连] → 自动重连**
如果 daemon 重启，ACP server 与 daemon 的 WebSocket 会断开。需要实现自动重连逻辑，或在下次 prompt 时重新建立连接。

## Resolved Questions

1. **OpenClaw acpx 支持自定义 Agent 注册。** 通过 `~/.acpx/config.json` 的 `agents` 字段配置 `{ "cozybase": { "command": "cozybase acp" } }` 即可。acpx 只支持 stdio 传输（spawn 子进程），不支持 HTTP 或连接已有进程。

2. **acpx 的传输方式仅限 stdio。** 调研确认 acpx 通过 spawn 子进程 + stdin/stdout ndjson 通信，不支持 Streamable HTTP 或其他传输。因此 `cozybase acp` 独立进程是必须的。

## Open Questions

1. **ACP SDK 的 `AgentSideConnection` API 是否足够稳定？** 需要在实现前评估 SDK 成熟度（npm 下载量、更新频率、类型完整性）。回退方案已在 Decision 4 中明确。

2. **conversation.notice 事件（异步任务完成通知）如何在 ACP 中呈现？** 当 CozyBase Agent 收到后台任务完成的系统通知后，会触发额外的 LLM 调用并产生新的 conversation 事件流。这些事件在当前 prompt turn 之外发生——ACP 是否支持 Agent 主动推送（非 prompt 响应的）session/update？如果不支持，可能需要在下次 prompt 时将通知结果作为上下文返回。
