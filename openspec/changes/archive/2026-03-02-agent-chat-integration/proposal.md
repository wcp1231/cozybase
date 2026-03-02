# Agent Chat Integration

## 概要

在 Admin UI 中实现与 AI Agent 对话的功能。用户可以在右侧 Chat Window 中与 AI Agent 进行自然语言交互，Agent 能够调用 Cozybase MCP 工具完成应用管理任务（创建 App、修改文件、执行 SQL 等），同时保留文件读写和 Bash 执行能力。

## 动机

当前 Admin UI 的 Chat Panel 是一个静态占位组件。MCP 工具目前仅通过 stdio transport 暴露给外部 CLI Agent（如 Claude Code），Admin UI 用户无法直接与 AI 交互完成任务。

接入 Claude Agent SDK 可以让用户在浏览器中即可获得与 CLI Agent 同等（甚至更好）的 AI 辅助能力。

## 方案

使用 `@anthropic-ai/claude-agent-sdk` 的 `unstable_v2_createSession` API 在 daemon 进程内管理 AI 会话：

- **SDK MCP Server (in-process)**: 使用 `createSdkMcpServer()` 将现有 MCP 工具注册为进程内 MCP server，工具 handler 直接调用 Workspace 方法，无需 HTTP 回环
- **ChatService**: 管理 SDKSession 生命周期，桥接浏览器 WebSocket 和 SDK 消息流
- **WebSocket endpoint**: 新增 `/api/v1/chat/ws` 用于 Admin UI Chat Window 的双向通信
- **Agent 工作目录**: 在 workspace 中创建 `agent/` 目录作为 Agent 的 CWD，用于文件操作

### 架构示意

```
Browser Chat Window
  │ WebSocket /api/v1/chat/ws
  ▼
Daemon (ChatService)
  │ unstable_v2_createSession()
  ▼
Claude subprocess (LLM + 内建工具: Bash, Read, Edit...)
  │ MCP protocol
  ▼
SDK MCP Server (in-process, 直接调用 Workspace)
```

## 范围

### 包含
- daemon 新增 `@anthropic-ai/claude-agent-sdk` 依赖
- 创建 SDK MCP Server，复用现有工具 handler 逻辑
- 创建 ChatService 管理会话和消息桥接
- 新增 `/api/v1/chat/ws` WebSocket endpoint
- Agent 工作目录初始化逻辑
- 基础 System Prompt
- 前端 Chat Panel 连接到 WebSocket，实现消息发送和流式接收

### 不包含
- 多并发 session 支持（MVP 仅单 session）
- 聊天历史持久化（依赖 SDK 内置 session persistence）
- 前端 App 列表自动刷新（后续单独处理）
- Codex SDK 集成（后续单独处理）
- 上下文感知注入（后续按需添加）

## 依赖

- `@anthropic-ai/claude-agent-sdk` (npm 包)
- 环境变量: `ANTHROPIC_API_KEY` (已有 Claude Code 用户应已配置)
- 全局安装的 `claude` CLI（SDK 底层需要）
