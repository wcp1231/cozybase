> Note
> 当前实现已经从早期的 “Operator 围绕 `pi-agent-core` 单独建模” 收敛为：
> `packages/ai-runtime` provider/runtime 层 + `packages/operator-agent` usage 层 + Builder/Operator 共享的 runtime-backed session skeleton。
> 因此第 4-9 节中的 `operator_sessions` / `OperatorStore` / `pi-agent-core` 事件映射等任务应视为历史设计产物；
> 当前权威实现以 `agent_runtime_sessions`、标准化 `conversation.*` 事件和共享 session 生命周期为准。
> 当前主验证与实际使用路径也以 `codex` / `claude-code` 为主；`pi-agent-core` 相关任务主要保留兼容性语义，不应再视为本次 change 的中心目标。

## 1. packages/operator-agent 初始化

- [x] 1.1 创建 `packages/operator-agent` 目录结构，包含 `package.json`、`tsconfig.json`、`src/index.ts`
- [x] 1.2 添加依赖：`@mariozechner/pi-agent-core`、`@mariozechner/pi-ai`、`@sinclair/typebox`
- [x] 1.3 定义公共类型 `src/types.ts`：`CallApiFn` 回调签名、`AppContext`（displayName、description、schema、functions）、`OperatorToolSet`
- [x] 1.4 在 monorepo workspace 配置中注册 `packages/operator-agent`，确保 daemon 可引用

## 2. Operator Tools 实现

- [x] 2.1 实现 `src/tools/list-tables.ts`：调用 `GET /fn/_db/schemas`，返回表名和列定义
- [x] 2.2 实现 `src/tools/query-data.ts`：参数为 `{ table, where?, select?, order?, limit? }`，调用 `GET /fn/_db/tables/{table}`
- [x] 2.3 实现 `src/tools/create-record.ts`：参数为 `{ table, data }`，调用 `POST /fn/_db/tables/{table}`
- [x] 2.4 实现 `src/tools/update-record.ts`：参数为 `{ table, id, data }`，调用 `PATCH /fn/_db/tables/{table}/{id}`
- [x] 2.5 实现 `src/tools/delete-record.ts`：参数为 `{ table, id }`，调用 `DELETE /fn/_db/tables/{table}/{id}`
- [x] 2.6 实现 `src/tools/call-function.ts`：参数为 `{ name, method?, body? }`，调用 `{method} /fn/{name}`
- [x] 2.7 导出 `createOperatorTools(callApi: CallApiFn): AgentTool[]` 工厂函数，汇总所有 tool

## 3. 动态 System Prompt 构建

- [x] 3.1 实现 `src/prompt-builder.ts`：`buildOperatorSystemPrompt(appContext: AppContext): string`
- [x] 3.2 prompt 中包含 APP 元数据（displayName、description）
- [x] 3.3 prompt 中包含数据表 schema（表名、列名、类型、主键、非空约束），以 Markdown 表格格式呈现
- [x] 3.4 prompt 中包含自定义 function 列表（函数名 + 可用 HTTP 方法），无自定义 function 时省略该段
- [x] 3.5 prompt 中包含操作规则（删除前确认、简洁中文回复等基本指令）

## 4. Platform 数据库 Migration

- [x] 4.1 在 `packages/daemon/src/core/platform-migrations.ts` 中新增 migration，创建 `operator_sessions` 表（`app_slug TEXT PRIMARY KEY, messages_json TEXT NOT NULL DEFAULT '[]', updated_at TEXT`）
- [x] 4.2 确认 `app_slug` 在 APP 删除时对应记录可被正确清除（通过应用层删除或外键级联）

## 5. Operator Session 持久化

- [x] 5.1 实现 `packages/daemon/src/operator/operator-store.ts`：基于 Bun SQLite 封装 `OperatorStore` 类
- [x] 5.2 实现 `getMessages(appSlug): AgentMessage[]`：读取并反序列化 `messages_json`
- [x] 5.3 实现 `saveMessages(appSlug, messages: AgentMessage[]): void`：序列化并 UPSERT 到 `operator_sessions` 表
- [x] 5.4 实现 `deleteSession(appSlug): void`：删除指定 APP 的 session 记录

## 6. LLM 配置加载

- [x] 6.1 扩展 `workspace.yaml` 的 Zod schema，新增 `operator?: { provider?: string, model?: string }` 配置段
- [x] 6.2 在 daemon 的 server 初始化阶段读取 operator 配置，通过 `pi-ai` 的 `getModel(provider, model)` 解析 Model 实例
- [x] 6.3 配置无效或缺失时回退默认值（`provider: 'anthropic'`, `model: 'claude-sonnet-4-20250514'`），并输出警告日志
- [x] 6.4 实现 `getApiKey` 回调，委托给 `pi-ai` 的 `getEnvApiKey(provider)` 环境变量解析

## 7. OperatorSession 核心实现

- [x] 7.1 实现 `packages/daemon/src/operator/operator-session.ts`：封装 `pi-agent-core Agent` 实例
- [x] 7.2 构造函数中通过 `stablePlatformClient.call(appSlug, ...)` 包装 `callApi` 回调，注入到 tool 工厂
- [x] 7.3 构造函数中调用 `buildOperatorSystemPrompt` 构建 system prompt 并设置到 Agent
- [x] 7.4 实现 `transformContext`：超出 N 条（默认 50）时裁剪最早的消息
- [x] 7.5 实现 `prompt(text: string)` 方法：调用 `agent.prompt()`，完成后通过 `OperatorStore` 持久化消息
- [x] 7.6 通过 `agent.subscribe()` 监听事件，转发给已连接的 WebSocket 客户端

## 8. pi-agent-core 事件到 conversation.* 事件映射

- [x] 8.1 实现事件映射函数，将 `agent_start` → `conversation.run.started`
- [x] 8.2 映射 `message_start`(assistant) → `conversation.message.started`，生成 `messageId`
- [x] 8.3 映射 `message_update`(text_delta) → `conversation.message.delta`，提取 `delta` 文本
- [x] 8.4 映射 `message_end`(assistant) → `conversation.message.completed`，提取完整 `content`
- [x] 8.5 映射 `tool_execution_start` → `conversation.tool.started`，提取 `toolUseId` 和 `toolName`
- [x] 8.6 映射 `tool_execution_end` → `conversation.tool.completed`，提取 `summary`
- [x] 8.7 映射 `agent_end` → `conversation.run.completed`

## 9. OperatorSessionManager

- [x] 9.1 实现 `packages/daemon/src/operator/operator-session-manager.ts`：维护 `Map<appSlug, OperatorSession>`
- [x] 9.2 实现 `getOrCreate(appSlug)`：内存命中 → 直接返回；持久化命中 → 恢复消息历史并创建；否则 → 新建空 session
- [x] 9.3 实现 `remove(appSlug)`：销毁内存 session 并删除持久化数据
- [x] 9.4 在 daemon 的 server 初始化阶段创建 `OperatorSessionManager`，注入 `OperatorStore`、LLM Model、`stablePlatformClient`

## 10. 获取 APP function 列表

- [x] 10.1 调研 `AppRegistry` 或运行时路由表是否提供了按 APP 查询已注册 function 名称的接口
- [x] 10.2 如果已有接口，在 `OperatorSession` 构建 prompt 时直接调用
- [x] 10.3 如果没有现成接口，在 Runtime 或 AppRegistry 中新增 `getFunctionNames(appSlug): string[]` 查询方法

## 11. WebSocket 端点接入

- [x] 11.1 在 `packages/daemon/src/index.ts` 的 `WsData` interface 中新增 `type: 'operator'`
- [x] 11.2 在 `fetch` handler 中新增 `/api/v1/operator/ws?app={appSlug}` 路由，upgrade 时附带 `{ type: 'operator', appSlug }`
- [x] 11.3 在 `websocket.open` handler 中对 `type === 'operator'` 分支调用 `OperatorSessionManager.getOrCreate()`，发送 `session.connected` 和 `session.history` 事件
- [x] 11.4 在 `websocket.message` handler 中解析共享消息协议 `{ type: 'chat:send', message }`（并兼容旧 `{ type: 'prompt', text }`）后调用 `OperatorSession.prompt()`
- [x] 11.5 在 `websocket.close` handler 中断开 Operator session 的 WebSocket 引用
- [x] 11.6 验证 APP 不存在或未 publish 时返回错误事件并关闭连接

## 12. 集成测试与验证

- [x] 12.1 创建一个测试用 APP（含 migrations、seed data、自定义 function），publish 到 Stable
- [ ] 12.2 通过 WebSocket 连接 Operator 端点，发送自然语言查询指令（如"列出所有记录"），验证 Agent 正确调用 `query_data` tool 并返回结果
- [ ] 12.3 发送创建指令（如"添加一条新记录"），验证 `create_record` tool 正确执行并持久化到 Stable 数据库
- [x] 12.4 断开并重新连接，验证 `session.history` 事件正确恢复之前的对话记录
- [ ] 12.5 验证 LLM 配置变更后新 session 使用新 model

## 13. Operator 多 runtime provider 配置

- [x] 13.1 扩展 `workspace.yaml` schema，新增 `operator.agent_provider?: 'pi-agent-core' | 'codex' | 'claude-code'` 与 `operator.model_provider?: string`
- [x] 13.2 在 daemon 的 Operator runtime resolver 中，按 `operator.agent_provider` 从 `AgentProviderRegistry` 选择 runtime provider
- [x] 13.3 为 `pi-agent-core` 保留 `operator.provider` → `operator.model_provider` 的向后兼容映射，并输出迁移提示日志
- [x] 13.4 当 `agent_provider = 'pi-agent-core'` 时继续使用 `pi-ai getModel(model_provider, model)` 解析模型
- [x] 13.5 当 `agent_provider = 'codex'` 或 `agent_provider = 'claude-code'` 时，将 `operator.model` 作为 provider-specific model 直接传递给 runtime provider

## 14. Operator action/adapters 分层

- [x] 14.1 将 `packages/operator-agent` 中的 Operator 能力抽象为 provider-neutral action 定义，复用统一的参数 schema 和执行逻辑
- [x] 14.2 保留并改造现有 native adapter，使 `pi-agent-core` 继续通过 native tools 调用同一组 Operator action
- [x] 14.3 新增 Operator MCP adapter 或 MCP server registration path，供 Codex/Claude Code runtime provider 使用
- [x] 14.4 确保 MCP adapter 暴露的 tool 名称、参数和行为与 native adapter 保持一致

## 15. OperatorSession 多 provider 接入

- [x] 15.1 改造 `OperatorSession`，根据 runtime provider capability 在 `native` 与 `mcp` toolMode 之间选择
- [x] 15.2 当 `toolMode = 'mcp'` 时，为 Operator session 注入独立的 Operator MCP server / MCP config，而不是复用 Builder MCP server
- [x] 15.3 当所选 provider 不支持 Operator 所需 tool mode 时，返回明确错误并拒绝建立 session
- [x] 15.4 确认 snapshot / restore / history 投影在 `pi-agent-core`、`codex`、`claude-code` 三种 Operator runtime 路径下都能工作

## 16. 多 provider 测试与验证

- [x] 16.1 增加自动化测试：`operator.agent_provider = 'codex'` 时，Operator session 使用 MCP tool mode 并能执行查询流程
- [x] 16.2 增加自动化测试：`operator.agent_provider = 'claude-code'` 时，Operator session 使用 MCP tool mode 并能执行查询流程
- [x] 16.3 验证 `operator.provider` 旧配置仍能兼容映射到 `pi-agent-core` 路径
- [x] 16.4 手工验证在 Codex / Claude Code provider 下，删除前确认、简洁中文回复等 Operator prompt 规则仍然成立

## 17. 前端 APP 使用页接入 Operator Chat

- [x] 17.1 调整 Web chat store，支持按 session kind 连接 Builder `/api/v1/chat/ws` 或 Operator `/api/v1/operator/ws`
- [x] 17.2 调整 Chat Panel，在 APP 使用页根据 session kind 渲染 Builder/Operator 文案和发送协议
- [x] 17.3 调整 `AppLayout`，仅在 APP 页面显示聊天入口；Home、APP 列表、Settings、Console 页面隐藏入口
- [x] 17.4 增加前端测试，覆盖 session kind 路由决策和 Operator 聊天连接/发送行为

## 18. Builder / Operator 架构收敛

- [x] 18.1 将 Builder 与 Operator 的 WebSocket / reconnect / snapshot / history / run buffer 生命周期收敛为共享的 runtime-backed session skeleton
- [x] 18.2 将前端出站协议统一为 `{ type: 'chat:send', message }`，Operator 仅保留旧 `{ type: 'prompt', text }` 的兼容处理
- [x] 18.3 将 Builder 与 Operator 的历史恢复统一为 runtime snapshot → normalized `session.history` 路径，并保留 Builder 的 legacy message store 作为兼容 fallback
