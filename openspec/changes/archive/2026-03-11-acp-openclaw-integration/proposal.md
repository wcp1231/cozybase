## Why

Cozybase 已经具备完整的 AI Agent 驱动的 APP 开发能力，包括 30+ MCP Tools、per-app chat session、Draft/Stable 生命周期管理。但这些能力目前只能通过 Cozybase 自身的 Web UI 使用。

OpenClaw 是一个开源个人 AI 助手平台，支持 Telegram、Discord、WhatsApp、Slack 等多种消息渠道，拥有多 Agent 路由和 ACP (Agent Client Protocol) 集成能力。ACP 是一个标准化协议，定义了 IDE/Client 与 AI 编码代理之间的通信方式，已被 Claude Code、Codex、Gemini CLI 等主流工具实现。

目标：让用户通过 OpenClaw 的任意消息渠道，用自然语言创建和管理 Cozybase APP。用户不需要打开 Cozybase Web UI，只需在 Telegram 里说"帮我做一个记账应用"就能触发完整的 APP 开发流程。

ACP 是合适的集成路径，因为 OpenClaw 的 `acpx` 插件已经支持通过 ACP 协议启动外部编码工具（如 Claude Code、Codex）。acpx 支持自定义 Agent 注册，只需在 `~/.acpx/config.json` 中配置即可：

```json
{
  "agents": {
    "cozybase": {
      "command": "cozybase acp"
    }
  }
}
```

acpx 只支持 stdio 传输（spawn 子进程 + stdin/stdout ndjson），不支持 HTTP 或其他传输方式。因此 `cozybase acp` 必须作为独立进程运行，通过 stdio 与 acpx 通信，通过 WebSocket 连接 daemon。

## Dependencies

本 change 依赖 `cozybase-agent` change。ACP 的 session/prompt 将桥接到 CozyBase Agent 的 session，而非直接桥接到 per-app Builder/Operator session。这是因为：

1. ACP Client（OpenClaw）不知道用户想操作哪个 APP，无法在 session 创建时指定 appSlug
2. CozyBase Agent 作为统一入口，负责意图理解和 APP 路由
3. ACP 只需要做"协议适配"（JSON-RPC over stdio ↔ WebSocket），不需要理解业务逻辑

```
OpenClaw → ACP stdio → cozybase acp → WebSocket → CozyBase Agent → Builder/Operator
```

## What Changes

- 新增 ACP Server 实现，作为 Cozybase daemon 的一个新入口点（`cozybase acp`），实现 ACP 协议的 stdio 传输层
- ACP session 桥接到 CozyBase Agent 的 WebSocket 端点（`/api/v1/cozybase/ws`），不直接操作 per-app session
- 将 CozyBase Agent session 的 `conversation.*` 事件流转换为 ACP 标准的 `session/update` 通知
- 实现 ACP 初始化、session/new、session/prompt、session/cancel
- 提供 OpenClaw 侧的 acpx 自定义 Agent 注册配置说明

## Capabilities

### New Capabilities
- `acp-server`: ACP 协议的 stdio 传输层实现，桥接到 CozyBase Agent session

### Dependencies
- `cozybase-agent`: CozyBase Agent 的 session 和工具集（由 `cozybase-agent` change 提供）

## Impact

- `packages/daemon/src/acp/`: 新增 ACP server 实现
- `packages/daemon/src/cli.ts`: 新增 `cozybase acp` CLI 命令
- 配置文件：文档化 OpenClaw 侧的 acpx 自定义 Agent 注册方式（`~/.acpx/config.json`）
- 不修改现有 Builder/Operator 代码
- 不修改已实现的 CozyBase Agent 代码
