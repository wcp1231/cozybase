# OpenSpec Specs

当前 `openspec/specs` 按能力域组织，建议优先按下面的边界理解：

- `agent-*`: Agent 会话、事件模型、provider 适配、prompt 与持久化
- `page-*` / `ui-batch`: 页面路由、页面级编辑、节点级编辑、校验与批处理
- `app-*` / `function-runtime` / `platform-client` / `hot-file-export`: APP 运行时、诊断、依赖、热更新与平台调用
- `desktop-*` / `workspace-init`: 桌面端与 workspace 能力

## 已完成整理

- `agent-session-per-app` 已并入 `agent-chat-service`
  - 原因：两者都在定义同一条能力边界，即“按 APP 隔离的聊天会话”
  - 合并后由 `agent-chat-service` 统一覆盖会话隔离、WebSocket 绑定、无 WebSocket 启动与串行执行语义

- 已补齐以下 spec 的 `Purpose`
  - `ai-app-creation-flow`
  - `ui-batch`
  - `hot-file-export`
  - `app-console`
  - `app-error-logs`
  - `app-scheduled-tasks`
  - `app-npm-dependencies`

- 已校正已知过时事件名
  - `ai-app-creation-flow` 中的 `chat:history` 改为 `session.history`
  - `hot-file-export` 中的浏览器刷新通知改为当前的 `session.reconciled` 语义

## 当前建议

- `page-level-editing`、`page-schema-editing`、`page-schema-validation` 目前不要合并
  - 这三份分别覆盖页面集合操作、节点级操作、全量校验，边界仍然清楚

- `platform-client` 后半段混入了前端 chat store / ChatPanel / AppLayout 约束
  - 这部分与 `PlatformClient` 本身不是同一层抽象
  - 如果后续继续演进聊天前端，建议拆出单独的 `web-chat-client` 或类似 spec

- `agent-event-types`、`agent-chat-service`、`agent-session-persistence` 目前也不建议合并
  - 前者是共享事件契约
  - 中间是会话服务语义
  - 后者是持久化与恢复规则
  - 三者职责清晰，只是关联紧密
