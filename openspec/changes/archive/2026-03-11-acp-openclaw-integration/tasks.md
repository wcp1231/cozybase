## 1. 依赖与模块骨架

- [x] 1.1 评估并引入 `@agentclientprotocol/sdk` 依赖；若不满足实现要求，明确采用手写 JSON-RPC/ndjson 的回退方案
- [x] 1.2 在 `packages/daemon/src/acp/` 下创建模块骨架文件（如 `acp-entry.ts`、`acp-server.ts`、`event-mapper.ts`、`types.ts`）
- [x] 1.3 在 daemon CLI 入口中新增 `cozybase acp` 命令，并支持 `--workspace` 等必要参数

## 2. stdio 入口与 daemon 桥接

- [x] 2.1 实现 ACP 进程的 stdin/stdout 传输层，处理 newline-delimited JSON 的输入输出
- [x] 2.2 复用现有 daemon 发现逻辑，定位 workspace 对应的 daemon 端口并连接 `/api/v1/cozybase/ws`
- [x] 2.3 实现 daemon 不可用、WebSocket 连接失败等启动错误的标准错误返回
- [x] 2.4 建立 ACP session 与 CozyBase Agent WebSocket 连接之间的内存映射，并支持同一 session 复用已建立连接

## 3. ACP 协议方法实现

- [x] 3.1 实现 `initialize` 请求处理，返回协议版本和 Phase 1 支持的能力声明
- [x] 3.2 实现 `session/new` 请求处理，创建 ACP session 并建立到 CozyBase Agent 的 WebSocket 连接
- [x] 3.3 实现 `session/prompt` 请求处理，将 ACP prompt 文本转换为 CozyBase Agent 的 `chat:send` 消息
- [x] 3.4 实现 `session/cancel` 请求处理，将取消动作转换为 CozyBase Agent 的 `chat:cancel` 消息
- [x] 3.5 实现 session 不存在、无活跃 prompt、WebSocket 已断开等异常场景的错误处理

## 4. 事件映射与 prompt 生命周期

- [x] 4.1 实现 `conversation.message.*` 到 ACP `session/update` 的文本流映射，保留消息关联标识
- [x] 4.2 实现 `conversation.tool.*` 到 ACP `session/update` 的工具调用映射，保留 `toolUseId`、工具名和结果摘要
- [x] 4.3 实现 `conversation.notice` 到 ACP 可见通知的映射
- [x] 4.4 实现 `conversation.run.completed`、`conversation.error` 和 `session.error` 对 `session/prompt` 结果的收束逻辑
- [x] 4.5 明确并实现异步通知在 ACP 中的呈现策略，确保 CozyBase Agent 后续主动事件不会被静默丢失

## 5. 文档与验证

- [x] 5.1 补充 OpenClaw / acpx 的集成说明，给出 `~/.acpx/config.json` 的自定义 Agent 配置示例
- [x] 5.2 为 ACP 入口、WebSocket bridge 和事件映射补充测试，覆盖 initialize、session/new、session/prompt、session/cancel 和错误场景
- [x] 5.3 运行相关类型检查与测试，确认 `cozybase acp` 集成实现可用
