## Context

当前 APP 模型使用 `name` 作为主键，同时承担 URL 路由标识和用户可见名称的双重角色。用户在 Builder 模式下创建 APP 需要手动填写 name 并走 REST API，没有 AI 驱动的创建流程。

已完成的前置工作：
- per-app Agent session（每个 APP 独立的 WebSocket 聊天通道 + 消息持久化）
- Builder/Home 双模式前端改造
- ChatPanel 三态渲染

## Goals / Non-Goals

**Goals:**

- 用户在 Dialog 中输入自由文本描述即可创建 APP，全程无需手动填写 slug/name
- 创建完成后前端立即跳转到 APP 编辑页面，Agent 已在后台开始工作
- APP 拥有独立的 display_name（支持中文），与 URL 安全的 slug（原 name）分离
- 新建 APP 自动完成 reconcile，跳转后 Draft 页面立即可访问

**Non-Goals:**

- 不在本次引入全局 Agent session（非 APP 级别的对话仍留空）
- 不修改 `rename` 接口语义（仍改 slug，display_name 通过单独接口更新）
- 不做 APP 模版库或预设模版选择功能

## Decisions

### 决策 1: APP 标识模型重设计 — slug + display_name

**选定**: 重新设计 `apps` 表结构，将 `name` 字段重命名为 `slug`（保持 PK），新增 `display_name TEXT NOT NULL` 字段。所有 FK 字段从 `app_name` 重命名为 `app_slug`。这是 MVP 版本，不需要兼容已有数据。

新 schema:
```sql
CREATE TABLE apps (
  slug TEXT PRIMARY KEY,           -- URL 安全标识 [a-zA-Z0-9_-]+
  display_name TEXT NOT NULL,      -- 人类友好名称（支持中文）
  description TEXT DEFAULT '',
  ...
);
-- FK 示例:
CREATE TABLE app_files (
  app_slug TEXT NOT NULL REFERENCES apps(slug) ON DELETE CASCADE,
  ...
);
```

**备选**: 保留 `name` 字段语义不变，仅新增 `display_name` 列。

**理由**: MVP 阶段没有线上用户数据需要迁移，直接重命名 `name → slug` 使字段语义更清晰。`slug` 明确表达"URL 安全标识"，避免和 `display_name` 混淆。同时所有 FK 从 `app_name` 改为 `app_slug` 保持一致性。虽然改动面覆盖全部表和引用代码，但一次性到位比后续再改成本更低。

### 决策 2: LLM 信息提取 — 用 claude-agent-sdk 的 query() 单轮调用

**选定**: 使用 `claude-agent-sdk` 的 `query()` API 配合 `claude-haiku` 模型，通过精简 system prompt 让模型返回结构化 JSON（slug, displayName, description）。不注册任何 MCP 工具，纯文本提取。

**备选 A**: 使用 `@anthropic-ai/sdk` 的 Messages API 直接调用。

**备选 B**: 启动完整 Agent session（含 MCP 工具），让 Agent 自行调用 `create_app`。

**理由**: 任务确定性高（从自由文本提取三个字段），不需要 Agent 的自主决策能力和工具调用。`query()` 比原始 Messages API 更一致（同 SDK），比完整 Agent session 更轻量。Haiku 模型足够便宜且快速（< 2s）。后端在 query 结果中解析 JSON，然后程序化调用 `manager.create()` + `reconcile()`，更可控。

### 决策 3: create 内含 auto-reconcile

**选定**: `manager.create()` 在创建模板文件并提交事务后，自动调用 `DraftReconciler.reconcile(name)` 初始化 Draft 环境。

**备选**: 保持 create 和 reconcile 分离，由调用方显式触发。

**理由**: 新建 APP 后 100% 需要 reconcile 才能产生可访问的 Draft 页面。内含 reconcile 简化了所有创建路径（HTTP API、MCP tool、ai-create 端点），避免调用方遗漏。reconcile 对新建 APP 很快（空 migrations，无实际重建），不会显著增加 create 延迟。

### 决策 4: 后端先行启动 Agent — injectPrompt 模式

**选定**: HTTP 端点在创建 APP 后，通过 `chatSessionManager.getOrCreate(slug).injectPrompt(idea)` 主动启动 Agent 工作。Agent 在无 WebSocket 连接的状态下运行，消息持久化到 SessionStore。前端跳转后建立 WebSocket，通过 `chat:history` 追赶已有消息，后续 streaming 事件实时推送。

**备选**: HTTP 端点只创建 APP，返回 slug 后由前端建立 WebSocket 并发送第一条消息。

**理由**: 后端先行可以在用户等待跳转的几秒钟内让 Agent 开始工作，用户到达 APP 页面时已有初步进展可看。现有 `ChatSession.sendToWs()` 的 null 守卫保证 ws 不存在时静默跳过，Agent SDK 的 `query()` 独立于 WebSocket 运行。唯一的代价是前端连上时可能丢失正在进行中的 streaming 文本片段，但该片段会在 turn 结束后被完整 assistant message 覆盖，影响可忽略。

### 决策 5: 前端传递 idea 到 APP 页面 — 不需要

由于决策 4 采用后端先行模式，前端不需要把原始 idea 带到 APP 页面再发送。HTTP 端点返回 slug 后前端直接 navigate，WebSocket 连上后通过 `chat:history` 获取 Agent 已产生的消息。

### 决策 6: create_app MCP 工具 schema 变更

**选定**: `create_app` 工具新增可选 `display_name` 参数。Agent 通过 MCP 创建 APP 时可以传入显示名称。缺省时 display_name 默认为空字符串（前端显示时 fallback 到 slug）。

### 决策 7: 前端 displayName 显示策略

**选定**: 所有 APP 可见名称统一使用 `displayName || name` 逻辑。AppSummary / AppInfo 类型新增 `displayName` 字段，UI 组件优先显示 displayName，不存在时 fallback 到 name（slug）。

## Risks / Trade-offs

**[slug 冲突]** LLM 生成的 slug 可能与已有 APP 冲突 → 后端在调用 `manager.create()` 前检测冲突，冲突时自动追加数字后缀（如 `fitness-tracker-2`）

**[LLM 输出格式不稳定]** Haiku 可能不严格返回 JSON → 使用 system prompt 强制 JSON 输出 + 解析失败时用正则 fallback 提取字段，最坏情况从用户输入生成默认 slug

**[Agent 后台运行时 streaming 丢失]** 前端连上前 Agent 已输出的 streaming 文本不会推送 → 可接受，turn 结束后完整消息被持久化。若后续体验不佳，可在 ChatSession 中维护 streaming buffer 并在 connect 时推送

**[create + reconcile 耦合]** auto-reconcile 失败会导致 create 看似成功但 Draft 环境不可用 → create 返回值中包含 reconcile 结果，前端可据此提示；reconcile 失败不回滚 APP 创建（APP 记录已有，可重新 reconcile）
