## Why

当前 Agent 开发 APP 时有 `execute_sql` 和 `call_api` 两个工具来验证数据和 API，但无法验证 UI。Agent 不知道组件是否正确渲染、数据是否正确展示、交互是否正常。

Agent 由 Daemon 通过 Claude Agent SDK 在服务端启动，Admin UI 显示 Agent 聊天交互界面。这意味着 Agent 进程在服务端，而 App UI 在用户浏览器的 Admin 页面中直接渲染——两者之间需要一条完整的调用链路。

## What Changes

### 1. Admin AppPageView 直接渲染 SchemaRenderer

`AppPageView` 直接使用 `<SchemaRenderer>` 渲染 App UI（与原有方案一致），不使用 iframe。Admin 通过 React Router 控制页面导航，SchemaRenderer 接收 `schema`、`baseUrl`、`params`、`navigate` 等 props。

好处：
- Dialog 不会被 iframe 边界裁切，overlay 覆盖整个视口
- 导航直接通过 React Router，无需 iframe src 同步或 hash 路由
- 无 postMessage 中继层，inspect 链路更短更简单
- 无 iframe 加载白屏问题

### 2. UI 组件标记 data-schema-id

`NodeRenderer` 渲染每个 schema node 时，在 DOM 根元素上添加 `data-schema-id` 属性（值为 schema 中的 `id` 或组件类型+索引）。这让 Inspector 能以 schema 语义定位组件，而不是依赖脆弱的 CSS selector。

### 3. Admin 端直接 DOM 检查

Admin 在 draft 模式下连接 WebSocket，接收 Agent 的 `inspect` 请求后直接遍历自身 DOM（`document.getElementById('cz-app-content')`）生成结构化 UI 状态树。无需 iframe 也无需 postMessage 中继。

DOM 检查逻辑（`ui-inspector.ts`）：
- 遍历 `[data-schema-id]` 元素生成组件树
- 按组件类型提取文本内容、表格数据、表单状态、可用 action
- 深度限制 10 层，table 数据预览限制 5 行

### 4. Admin 端 Bridge Client

Admin 端 `BridgeClient` 仅负责 WebSocket 通信，不涉及 iframe 或 postMessage：

**读取类工具**（第一阶段）：
- `inspect_ui(app, page?)` — 返回页面的结构化 UI 状态树（组件类型、文本内容、表格数据、表单状态等）

**交互类工具**（第二阶段）：
- `click(component_id)` — 点击指定组件，返回更新后的 UI 状态
- `fill(component_id, value)` — 填入输入框，返回更新后的 UI 状态
- `submit(form_id)` — 提交表单，返回结果和更新后的 UI 状态

## Capabilities

### New Capabilities

- `agent-ui-inspector`: Agent 通过 WebSocket + 直接 DOM 检查读取 Admin 中渲染的 App UI，实现 UI 验证

### Modified Capabilities

- `mcp-tools`: 后续可增加对应的 MCP 工具供 CLI Agent 使用（通过 headless browser 作为 fallback）

## Impact

- **`packages/admin/src/pages/app-page-view.tsx`**: 使用 `<SchemaRenderer>` 直接渲染 App UI，draft 模式下集成 BridgeClient + WebSocket
- **`packages/admin/src/lib/bridge-client.ts`**: 纯 WebSocket 通信，接收 `ui:request` 调用注册的 handler 后返回 `ui:response`
- **新增 `packages/admin/src/lib/ui-inspector.ts`**: DOM 遍历检查逻辑，从 `[data-schema-id]` 元素提取结构化数据
- **`packages/ui/src/renderer.tsx`**: `NodeRenderer` 添加 `data-schema-id` 属性
- **`packages/runtime/src/modules/ui/routes.ts`**: 仅保留 `/ui` 和 `/assets/*` API 路由，移除 standalone HTML 和 bridge 脚本

## Phasing

分两阶段实施：

1. **Phase 1 — 基础设施 + 读取能力**: data-schema-id 标记、DOM 检查逻辑、BridgeClient WebSocket 集成、`inspect_ui` 工具
2. **Phase 2 — 交互模拟**: `click`、`fill`、`submit` 等交互工具、`screenshot_ui`
