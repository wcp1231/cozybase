## 1. Package 基础结构与类型定义

- [x] 1.1 创建 `packages/cozybase-agent` package 目录，初始化 `package.json`（依赖 `packages/ai-runtime`）和 TypeScript 配置
- [x] 1.2 在 `packages/cozybase-agent/src/types.ts` 中定义核心类型：`DelegatedTask` 接口、工具输入/输出类型、`CallApiFn` 回调类型
- [x] 1.3 在 `packages/daemon/src/ai/cozybase/` 目录下创建模块骨架文件（`session.ts`、`session-manager.ts`、`task-registry.ts`、`mcp-server.ts`、`config.ts`）

## 2. EventBus 扩展

- [x] 2.1 在 EventBus 的事件类型定义中新增 `task:completed` 事件（payload: `{ taskId: string, appSlug: string, summary: string }`）
- [x] 2.2 在 EventBus 的事件类型定义中新增 `task:failed` 事件（payload: `{ taskId: string, appSlug: string, error: string }`）

## 3. LLM 配置与 Settings API

- [x] 3.1 创建 `packages/daemon/src/modules/settings/cozybase-agent-config.ts`，实现 CozyBase Agent 配置解析（三级 fallback：`platform_settings` 表 → 环境变量 → 默认值），参考现有 `operator-agent-config.ts` 模式
- [x] 3.2 在 settings routes 中新增 `GET /api/v1/settings/cozybase-agent` 和 `PUT /api/v1/settings/cozybase-agent` 端点，读写 `cozybase_agent.agent_provider`、`cozybase_agent.model_provider`、`cozybase_agent.model`

## 4. TaskRegistry 实现

- [x] 4.1 实现 `TaskRegistry` 核心逻辑：`enqueue()` 将任务加入 per-app 队列（key 为 `"{appSlug}:{target}"`），队列为空时立即执行，否则排队
- [x] 4.2 实现 TaskRegistry 的任务状态管理：`markCompleted(taskId, summary)` 和 `markFailed(taskId, error)`，完成后自动推进队列中下一个任务
- [x] 4.3 实现 TaskRegistry 的查询方法：`getTask(taskId)` 返回完整 `DelegatedTask` 信息、`getQueueStatus(appSlug, target)` 返回队列状态
- [x] 4.4 TaskRegistry 订阅 EventBus 的 `task:completed` 和 `task:failed` 事件，自动更新任务状态并推进队列

## 5. 直接工具定义

- [x] 5.1 实现 `list_apps` 工具：通过 AppManager 列出所有 APP，返回字段限制为 slug、displayName、status
- [x] 5.2 实现 `get_app_detail` 工具：通过 AppManager 获取指定 APP 的详细信息（状态、版本、页面列表、function 列表）
- [x] 5.3 实现 `start_app` 工具：启动指定 APP 的 Stable 运行时
- [x] 5.4 实现 `stop_app` 工具：停止指定 APP 的 Stable 运行时
- [x] 5.5 实现 `delete_app` 工具：删除指定 APP 及关联的 Builder/Operator session

## 6. 委派工具定义

- [x] 6.1 实现 `create_app` 工具：创建 APP 后将构建任务入队 TaskRegistry（target=builder），立即返回 `{ taskId, appSlug, status }`
- [x] 6.2 实现 `develop_app` 工具：将开发任务入队 TaskRegistry（target=builder），立即返回 `{ taskId, appSlug, status }`
- [x] 6.3 实现 `operate_app` 工具：将操作任务入队 TaskRegistry（target=operator），立即返回 `{ taskId, appSlug, status }`；校验 APP 有 Stable 版本且运行中

## 7. System Prompt 构建

- [x] 7.1 实现 `packages/cozybase-agent/src/prompt.ts` 中的 `buildCozyBaseSystemPrompt()` 函数，包含角色定位、直接工具说明、委派工具说明、异步任务行为说明和交互规范

## 8. MCP Server 与 Session 层

- [x] 8.1 实现 CozyBase Agent 的 MCP server（`mcp-server.ts`），注册所有直接工具和委派工具，接受 daemon 内部 API 回调注入
- [x] 8.2 实现 `CozyBaseSession`：使用 `AgentRuntimeProvider.createQuery()` 驱动 LLM 查询、管理 WebSocket 连接、处理 `conversation.*` 事件转发、维护 streaming 状态
- [x] 8.3 实现 CozyBaseSession 的消息历史持久化：使用 `RuntimeSessionStore`（`usage_type='cozybase'`、`app_slug='__cozybase__'`），支持 session 恢复和 `session.history` 推送
- [x] 8.4 实现 CozyBaseSession 的异步通知注入：订阅 EventBus `task:completed` / `task:failed` 事件，通过 `injectPrompt()` 注入 `[系统通知]` 消息
- [x] 8.5 实现 CozyBaseSession 的通知排队机制：streaming 期间收到的通知进入队列，当前 prompt 处理完毕后逐条注入
- [x] 8.6 实现 `CozyBaseSessionManager`：`getOrCreate()` 延迟创建并复用单例 `CozyBaseSession`，读取 settings 配置创建 `AgentRuntimeProvider`

## 9. WebSocket 端点与集成

- [x] 9.1 在 `packages/daemon/src/index.ts` 中新增 `/api/v1/cozybase/ws` WebSocket upgrade 路由，`WsData` 扩展 `type: 'cozybase'`
- [x] 9.2 在 WebSocket open/message/close handler 中新增 `cozybase` 分支，路由到 `CozyBaseSessionManager`

## 10. Builder/Operator Session 扩展

- [x] 10.1 在 `RuntimeAgentSession` 或其子类中新增 `delegatedTaskId` 可选属性，支持外部注入
- [x] 10.2 扩展 Builder `ChatSession.afterPrompt()`：当 `delegatedTaskId` 不为 null 时，通过 EventBus 发布 `task:completed` 事件（包含 taskId、appSlug、summary），然后重置 `delegatedTaskId`
- [x] 10.3 扩展 Operator `OperatorSession.afterPrompt()`：与 Builder 相同的 `delegatedTaskId` 事件发布逻辑
- [x] 10.4 处理委派查询失败场景：session 执行出错时发布 `task:failed` 事件（包含 taskId、appSlug、error）
