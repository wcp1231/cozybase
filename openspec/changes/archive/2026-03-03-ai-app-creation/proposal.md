## Why

Builder 模式下用户需要通过 AI Agent 来创建 APP，但目前缺少从"用户描述想法"到"APP 创建并进入编辑"的完整自动化流程。同时，现有 APP 数据模型中 `name` 既作为主键/URL 标识又作为显示名称，无法支持中文等人类友好的显示名。

## What Changes

- 新增 `display_name` 字段到 `apps` 表，使 APP 支持人类友好的显示名称（如中文）；现有 `name` 字段保持原有语义，作为 URL 安全的唯一标识（即 slug）
- 新增 `POST /api/v1/apps/create-with-ai` HTTP 端点，接收用户自由文本描述，通过轻量 LLM 调用（Haiku）提取结构化 APP 信息，自动完成 APP 创建和 Draft 环境初始化
- `create_app` MCP 工具新增 `display_name` 参数，`manager.create()` 内部自动触发 reconcile，使新建 APP 立即拥有可访问的 Draft 编辑页面
- ChatSession 新增 `injectPrompt()` 方法，支持后端在无 WebSocket 连接时主动向 Agent session 注入用户消息并启动 Agent 工作，前端跳转后通过 `chat:history` 追赶进度
- 前端 `CreateAppDialog` 对接新端点，创建成功后自动跳转到 APP 编辑页面；前端各处显示 `displayName` 替代 `name`

## Capabilities

### New Capabilities

- `ai-app-creation-flow`: 覆盖 AI 驱动的 APP 创建流程——从用户文本输入到 LLM 信息提取、APP 创建、reconcile、Agent session 启动、前端跳转的完整链路

### Modified Capabilities

- `agent-chat-service`: ChatSession 新增无 WebSocket 触发能力（`injectPrompt`），允许后端主动启动 Agent 工作
- `agent-session-per-app`: APP 创建端点需要在 APP 不存在时预先创建 session 并注入 prompt，扩展了 session 的生命周期起点

## Impact

- **后端**: `workspace.ts`（schema 变更）、`manager.ts`（create 签名 + auto-reconcile）、`chat-session.ts`（injectPrompt）、`chat-session-manager.ts`（暴露 injectPrompt 入口）、`server.ts`（新 HTTP 端点）、`sdk-mcp-server.ts` + `handlers.ts` + `mcp-types.ts`（create_app schema 变更）
- **前端**: `create-app-dialog.tsx`（对接新端点 + 跳转）、`app-card.tsx` / `app-page-view.tsx` / `app-sidebar.tsx` / `home-page.tsx`（显示 displayName）、`types.ts`（AppSummary/AppInfo 类型）
- **数据库**: `apps` 表新增 `display_name` 列（`ALTER TABLE` 兼容已有数据）
- **API**: 所有返回 APP 信息的端点新增 `displayName` 字段；新增 `create-with-ai` 端点
- **依赖**: 需要 `@anthropic-ai/sdk`（Anthropic Messages API）用于 Haiku LLM 调用，或复用 `claude-agent-sdk` 的底层能力
