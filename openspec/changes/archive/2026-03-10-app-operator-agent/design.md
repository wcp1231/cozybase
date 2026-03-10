## Context

当前 cozybase 有一套面向 APP 开发的 Agent 体系：`ChatSessionManager` → `ChatSession` → Claude/Codex SDK，通过 MCP Tools 操作 APP 源码（文件、迁移、UI schema）。该体系服务于 APP 创建和修改场景。

现在需要新增一套面向 APP 使用的 Operator Agent 体系。与开发 Agent 的区别：

| 维度 | Development Agent | Operator Agent |
|------|-------------------|----------------|
| 目标用户 | APP 开发者 | APP 使用者 |
| 操作对象 | APP 源码（控制面） | APP 数据（数据面） |
| 目标运行时 | Draft | Stable |
| LLM 框架 | `packages/ai-runtime` 上的 Codex / Claude / 兼容 provider | `packages/ai-runtime` 上的 Codex / Claude / 兼容 provider |
| Agent 智能要求 | 高（编码、设计） | 中（理解意图、调 API） |

现有可复用的基础设施：
- Stable APP 的 `_db` REST API 和自定义 functions 已经完整暴露了数据操作能力
- PlatformClient 提供了 daemon 到 APP 运行时的同进程调用通道
- 前端 ChatPanel 和聊天 store 可基于 `conversation.*` 事件体系复用
- Builder 已有的 WebSocket / session / history 骨架可复用，但需要收敛成对 Builder/Operator 对称的 runtime-backed 实现
- `packages/ai-runtime` 已经提供统一的 runtime/provider registry，以及 `pi-agent-core`、`codex`、`claude-code` 三种 provider 接入点

当前实际实现与验证的重点是：
- Builder 与 Operator 的 session 生命周期统一
- Operator 在 APP 使用页接入 Codex / Claude Code 路径
- `pi-agent-core` 仅作为兼容 provider 保留在 runtime 能力矩阵中

## Goals / Non-Goals

**Goals:**
- 用户可以在 Stable APP 内通过自然语言完成数据查询、创建、修改、删除等操作
- Agent 自动感知 APP 的 schema 和可用 functions，无需人工配置每个 APP 的 tool
- 消息历史持久化，支持多轮对话和 session 恢复
- 支持用户自选 LLM provider 和 model（不限于 OpenAI/Anthropic）
- 前端可复用现有聊天 UI 组件和事件协议

**Non-Goals:**
- 跨 APP 路由和 Router Agent（Phase 2）
- 多用户 session 隔离
- APP 创建者提供自定义 Agent 指令（如 `agent.yaml`，后续扩展）
- Operator Agent 修改 APP 代码或结构
- 支持 Draft 运行时操作

## Decisions

### Decision 1: 新建 `packages/operator-agent` 独立 package

**选择：** 将 tool 定义、prompt builder、类型导出放在 `packages/operator-agent`，daemon 引用该 package。

**原因：**
- operator 的核心逻辑（tool schema、prompt 构建）是纯函数，不依赖 daemon 的运行时环境
- 独立 package 允许后续在其他上下文（如 CLI、测试）中复用
- 与统一的 `packages/ai-runtime` provider/runtime 层配合，并保持 usage 层可独立演进

**替代方案：** 直接放在 `packages/daemon/src/operator/` 内部。更简单但耦合度高，tool 定义无法在外部测试中独立使用。

### Decision 2: Tool 通过 `callApi` 回调注入，不直接依赖 PlatformClient

**选择：** `packages/operator-agent` 的每个 tool 工厂函数接受 `callApi: (path: string, options?: RequestInit) => Promise<Response>` 回调参数。daemon 在创建 OperatorSession 时将 PlatformClient 包装为该回调注入。

```typescript
// packages/operator-agent/src/tools/query-data.ts
export function createQueryDataTool(callApi: CallApiFn): AgentTool { ... }

// packages/daemon/src/operator/operator-session.ts
const callApi = (path, opts) => stablePlatformClient.call(appSlug, path, opts);
const tools = [
  createQueryDataTool(callApi),
  createCreateRecordTool(callApi),
  // ...
];
```

**原因：**
- `packages/operator-agent` 保持对 runtime/daemon 零依赖
- 单元测试时可注入 mock callApi
- 复用 PlatformClient 已有的同进程路由、Call-Depth 保护、免认证特性

**替代方案：** 让 tool 直接构造 HTTP 请求调用 Stable APP。引入网络开销且绕过了 PlatformClient 的安全机制。

### Decision 3: 会话持久化以 runtime snapshot 为主，历史统一投影为 `session.history`

**选择：** Builder 与 Operator 统一使用 `agent_runtime_sessions` 持久化 provider-native snapshot；前端恢复历史时统一将 snapshot 投影为标准化 `StoredMessage[]`。

**原因：**
- 当前真正需要跨 provider 兼容的是“恢复会话”和“恢复历史”，而不是保留某个 provider 的原始消息格式
- Builder 与 Operator 共享 runtime-backed session skeleton 后，历史恢复路径也应保持一致
- 将 provider-native snapshot 留在 runtime 层，更容易兼容 Codex / Claude / `pi-agent-core` 的差异

**替代方案：** 让 Builder 和 Operator 各自维护不同的 message store。这样短期简单，但会继续放大 usage 层的分叉。

**Trade-off：** 需要在 runtime 层提供 snapshot → history projection；但这比在 usage 层维护多套历史恢复逻辑更稳定。

### Decision 4: provider-specific 事件在 runtime 层归一化，usage 层只消费 `conversation.*`

**选择：** `packages/ai-runtime` 负责把 Codex / Claude / `pi-agent-core` 等 provider 的原生事件统一归一化为 `conversation.*`；Builder 与 Operator session 都只订阅统一事件流。

**原因：**
- usage 层不应知道 provider-specific 事件细节
- Builder 与 Operator 的 WebSocket / reconnect / history / buffer 逻辑应该共享
- 这样可以把 provider 差异收敛在 runtime 层，而不是让 Operator 继续围绕 `pi-agent-core` 定义架构

**实现要点：**
- runtime provider 负责 provider-native event → `conversation.*` 的映射
- daemon session 只负责把标准化事件转发到前端，并维护 run buffer / snapshot 保存
- 前端聊天 store 继续只处理一套 `conversation.*` / `session.*` 协议

### Decision 5: System Prompt 在 Session 创建时一次性构建

**选择：** `buildOperatorSystemPrompt` 在 OperatorSession 创建时调用一次，将 APP schema 和 function 列表嵌入 system prompt。在 session 生命期内 prompt 不再更新。

**原因：**
- Stable APP 的 schema 变更需要重新 publish，频率低
- 避免每次 LLM 调用前的额外 schema 查询开销
- system prompt 变更会意味着对话上下文发生语义断裂，不如重建 session

**Trade-off：** 如果用户 publish 了新版本（schema 变更），已有 OperatorSession 的 prompt 不会自动更新。可以在后续通过监听 `app:published` 事件重建 session 来解决，但 Phase 1 暂不处理。

### Decision 6: 获取 function 列表的方式

**选择：** 在 OperatorSession 构建 prompt 时，通过 daemon 内部的 AppRegistry 获取目标 APP 的已注册函数路由列表，而非新增 REST 端点。

**原因：**
- daemon 内部的 `AppRegistry` 或运行时路由表已经持有每个 APP 的 function 注册信息
- 构建 prompt 是 daemon 内部操作，不需要经过 HTTP 层
- 避免为内部消费新增公开 API

**替代方案：** 新增 `GET /fn/_meta/functions` 端点。公共可用性更好，但 Phase 1 只在 daemon 内部使用，不值得新增公开端点。后续如果 Operator Agent 需要支持远程部署，再考虑新增。

### Decision 7: Operator runtime provider 与模型配置拆分

**选择：** 在 `workspace.yaml` 中为 Operator 使用两层配置：

```yaml
operator:
  agent_provider: pi-agent-core
  model_provider: anthropic
  model: claude-sonnet-4-20250514
```

其中：
- `agent_provider` 表示 runtime provider，首批支持 `pi-agent-core`、`codex`、`claude-code`
- `model_provider` 仅在 `agent_provider = pi-agent-core` 时使用，用于传给 `pi-ai`
- 保留向后兼容：若只有旧的 `operator.provider`，则将其视为 `model_provider`

daemon 启动时根据 `agent_provider` 走两条解析路径：
- `pi-agent-core`：通过 `pi-ai` 的 `getModel(model_provider, model)` 解析
- `codex` / `claude-code`：直接将 `model` 作为 provider-specific model 字符串传给对应 runtime provider

**原因：**
- 现有 `operator.provider` 在语义上同时可能表示 runtime provider 与底层模型厂商，扩展到 Codex / Claude Code 后会立即冲突
- runtime provider 与模型厂商并不总是一一对应，尤其是 `pi-agent-core` 与 `pi-ai` 的组合
- 配置拆分后，Builder 与 Operator 在宿主层都可以沿用 “先选 runtime provider，再选 provider-specific model” 的模式
- 这也让文档能准确表达现实状态：当前 Operator 主路径是 Codex / Claude Code，`pi-agent-core` 仅保留兼容入口

### Decision 8: WebSocket 端点并行于 dev agent

**选择：** Operator Agent 使用独立端点 `/api/v1/operator/ws?app={appSlug}`，和现有 dev agent 的 `/api/v1/chat/ws?app={appSlug}` 并行。

**原因：**
- 两套 Agent 的职责和生命周期完全不同
- 前端可以根据场景（Builder 模式 vs. User 模式）连接不同端点
- 共用端点需要在协议层区分 Agent 类型，增加不必要的复杂度

**实现要点：**
- 在 `index.ts` 的 `Bun.serve` 中新增 `ws.data.type = 'operator'` 分支
- `WsData` interface 扩展新的 type 值
- open/message/close handler 中根据 type 分发到 `OperatorSessionManager`

### Decision 9: Operator usage 维护 provider-neutral action 定义，再由 runtime transport 装配为 native 或 MCP

**选择：** `packages/operator-agent` 不再只导出一份仅适用于 `pi-agent-core` 的 native tools，而是拆成三层：

```text
operator-agent
├── action definitions
├── native adapter
└── mcp adapter
```

同一组 action（`list_tables`、`query_data`、`create_record`、`update_record`、`delete_record`、`call_function`）在：
- `pi-agent-core` 兼容路径下可装配为 native tools
- `codex` / `claude-code` 下装配为 MCP tools

**原因：**
- Operator 的业务能力是稳定的，变化的是 provider 的 tool protocol
- 若把 action 定义和 transport/protocol 混在一起，后续每多一个 provider 都要复制一整份 Operator tool 逻辑
- 这样能保持 `packages/operator-agent` 继续是 usage 层，而不是 provider 层

### Decision 10: Builder 与 Operator 共用 session skeleton，只保留 prompt / context / tools 差异

**选择：** Builder 与 Operator 在 daemon 内共用同一套 runtime-backed session skeleton，包括：

- WebSocket connect / reconnect
- `session.connected` / `session.history`
- provider snapshot restore / persist
- streaming 状态与 run buffer
- cancel / interrupt

两者只保留三类 usage 差异：
- system prompt
- context loader
- tool / MCP config 组装

**原因：**
- 从用户视角看，Builder 和 Operator 都是“Agent 会话”，不应有两套不同的生命周期模型
- 当前多出来的复杂度主要是历史包袱，不是业务本质差异
- 共享骨架后，provider 行为变化只需要在 runtime 层适配一次

### Decision 11: Operator MCP server 与 Builder MCP server 分离

**选择：** 为 Operator usage 提供独立的 in-process MCP server / registration path，而不是把 Operator tool 混进 Builder MCP server。

**原因：**
- Builder 和 Operator 的 tool 面向完全不同的资源面，混用会让模型看到错误的能力集合
- Operator MCP server 只需要暴露 Stable 数据面能力，Builder MCP server 暴露的是源码控制面能力
- 分离后 daemon 宿主层能针对不同 usage 精确地把 MCP server 注入到对应 session

## Risks / Trade-offs

**[LLM 成本] → 提供小模型默认配置**
用户每次自然语言操作都会触发 LLM 调用。简单操作（如"帮我查一下库存"）可能只需要一次 tool call，但成本仍高于直接 UI 操作。建议默认使用成本较低的模型（如 `gpt-4o-mini`、`claude-haiku`），用户可按需升级。

**[Schema 变更不自动感知] → Phase 1 接受，后续优化**
如果用户 publish 了新 schema，已有 OperatorSession 的 system prompt 不会更新。用户需要重新打开聊天窗口触发 session 重建。后续可通过监听 `app:published` 事件自动重建。

**[配置语义迁移] → 保留旧 key 兼容**
`operator.provider` 已经在旧实现中代表底层模型厂商。新增 `operator.agent_provider` / `operator.model_provider` 后，需要清晰定义兼容策略和日志提示，避免用户已有配置静默失效。

**[Stable 模式下的写入权限] → 已通过 REST API 解决**
Stable 模式的 `execute_sql` 限制为 SELECT only，但 `_db` REST API 的 POST/PATCH/DELETE 是独立实现，不受该限制。Operator tools 全部走 REST API，因此写入操作不受影响。

**[`pi-agent-core` 作为兼容 provider] → 保留但不再作为 Operator 架构中心**
当前实现已经把 provider 差异下沉到 `packages/ai-runtime`。`pi-agent-core` 仍然保留为兼容 provider，但 Operator usage 的主干设计、主要验证路径与前端接入都不再围绕它展开。

**[Codex / Claude 作为 Operator runtime] → prompt/tool 适配质量需重新验证**
Builder 场景里 Claude/Codex 处理的是源码控制面，Operator 场景里处理的是数据面。即便 transport 层能复用，也仍需要重新验证：
- tool 描述是否足够清晰
- 删除/写入前确认规则是否稳定遵守
- MCP tool result 格式是否会影响模型决策质量

**[provider snapshot 与 normalized history 双表示] → 用共享 skeleton 收敛**
runtime snapshot 负责 provider-native 恢复，`session.history` 负责前端恢复；这要求 runtime 层同时提供 snapshot 和 normalized history projection。该复杂度目前是可接受的，因为它已经被共享骨架收敛在一处。

## Open Questions

1. **前端 Operator 聊天的入口在哪？** 已决定 Phase 1 仅在 APP 使用页面复用现有 ChatPanel：
   - `/:mode/apps/:appName/*` 页面显示聊天入口
   - `stable` 模式连接 `/api/v1/operator/ws`
   - `draft` 模式继续连接 Builder `/api/v1/chat/ws`
   - Home 页面、APP 列表、Settings 和 Console 页面不显示聊天入口
   - 前端聊天 store 继续复用统一的 `conversation.*` / `session.*` 事件处理，只在连接 URL 上区分 Builder/Operator

2. **是否需要清除 session 的 UI 操作？** 当 Agent 产生幻觉或上下文混乱时，用户可能需要手动清空对话重新开始。可以在 WebSocket 协议中增加 `{ type: 'clear' }` 消息类型。

3. **APP 的 function 列表如何获取？** spec 要求从 Stable 运行时获取已注册 function 列表。当前 `AppRegistry` 的 API 是否直接暴露了每个 APP 的 function 路由名？需要在实现时确认，可能需要在 Runtime 或 AppRegistry 中新增一个查询方法。
