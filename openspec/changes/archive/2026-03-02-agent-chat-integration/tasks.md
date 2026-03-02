## 1. 项目设置

- [x] 1.1 在 `packages/daemon` 中添加 `@anthropic-ai/claude-agent-sdk` 依赖
- [x] 1.2 在 workspace 初始化逻辑中添加 `agent/` 和 `agent/apps/` 目录的自动创建

## 2. LocalBackend 实现

- [x] 2.1 创建 `packages/daemon/src/agent/local-backend.ts`，实现 `CozybaseBackend` 接口
- [x] 2.2 实现 App 生命周期方法：`createApp`、`listApps`、`fetchApp`、`deleteApp`、`startApp`、`stopApp`（直接调用 Workspace + AppRegistry）
- [x] 2.3 实现文件同步方法：`pushFiles`、`pushFile`（直接操作 platform DB 的 app_files 表）
- [x] 2.4 实现开发工作流方法：`reconcile`、`verify`、`publish`（调用 DraftReconciler / Verifier / Publisher，publish 成功后通过 AppRegistry 重启运行时）
- [x] 2.5 实现运行时交互方法：`executeSql`、`callApi`（通过 AppContext 获取 DB 句柄执行）
- [x] 2.6 实现 `inspectUi` 方法（委托给 UiBridge）

## 3. SDK MCP Server 注册

- [x] 3.1 创建 `packages/daemon/src/agent/sdk-mcp-server.ts`，使用 `createSdkMcpServer()` + `tool()` 注册所有工具
- [x] 3.2 复用现有 `TOOL_DESCRIPTIONS`、Zod schemas 和 `handle*` 函数，以 `LocalBackend` 构造 `HandlerContext`
- [x] 3.3 验证注册的工具集合与现有 stdio MCP Server 一致

## 4. ChatService 核心

- [x] 4.1 创建 `packages/daemon/src/agent/chat-service.ts`，实现 ChatService 类
- [x] 4.2 实现 `connect(ws)` 方法：浏览器连接时创建或复用 SDKSession，启动 stream 转发循环
- [x] 4.3 实现 `handleMessage(ws, message)` 方法：解析 `chat:send` 和 `chat:cancel` 消息类型
- [x] 4.4 实现 stream 转发循环：遍历 `session.stream()` 产生的 SDKMessage，通过 WebSocket 推送到浏览器
- [x] 4.5 实现 `disconnect(ws)` 方法：断开浏览器连接但保留 session
- [x] 4.6 实现 `shutdown()` 方法：关闭 session 和清理资源

## 5. System Prompt

- [x] 5.1 创建 `packages/daemon/src/agent/system-prompt.ts`，编写 Cozybase 专用 system prompt（包含 Agent 身份、工具概述、开发工作流、工作目录说明）

## 6. WebSocket Endpoint 集成

- [x] 6.1 修改 `packages/daemon/src/index.ts`：在 fetch handler 中添加 `/api/v1/chat/ws` 的 WebSocket upgrade 处理，通过 `data.type` 区分连接类型
- [x] 6.2 修改 websocket handler（open/message/close）：按 `ws.data.type` 分发到 UiBridge 或 ChatService
- [x] 6.3 修改 `packages/daemon/src/server.ts`：在 `createServer()` 中初始化 LocalBackend、SDK MCP Server 和 ChatService，并将 ChatService 实例返回

## 7. 前端 Chat Panel 改造

- [x] 7.1 创建 `packages/admin/src/lib/chat-client.ts`：封装 Chat WebSocket 连接管理（连接、重连、消息发送）
- [x] 7.2 创建 `packages/admin/src/hooks/use-chat.ts`：封装 Chat 状态管理 hook（消息列表、Agent 状态、发送/取消操作）
- [x] 7.3 改造 `packages/admin/src/pages/app-layout.tsx` 中的 ChatPanel 组件：替换静态内容为实际的消息列表和输入交互
- [x] 7.4 实现流式文本渲染：解析 `stream_event` 消息中的文本增量，实现打字效果
- [x] 7.5 实现工具执行状态展示：解析 `tool_progress` 和 `tool_use_summary` 消息，渲染工具指示器
- [x] 7.6 实现 Agent 状态管理：根据 `result` 消息切换输入框启用/禁用状态，支持取消按钮

## 8. 端到端验证

- [x] 8.1 启动 daemon，验证 Agent 工作目录自动创建
- [x] 8.2 打开 Admin UI，验证 Chat Panel WebSocket 连接建立
- [x] 8.3 发送消息验证完整对话流程：用户输入 → Agent 流式响应 → 工具调用 → 结果返回
- [x] 8.4 验证 MCP 工具调用：通过 Chat 要求 Agent 创建一个 App 并完成 reconcile/publish 流程
