## 1. UI 组件标记（packages/ui）

- [x] 1.1 在 `NodeRenderer` 中为每个 schema 组件添加 `data-schema-id` + `data-schema-type` 包裹 div（`display: contents`），ID 规则：有 `id` 字段用 `id`，否则用 `{type}-{siblingIndex}`
- [x] 1.2 确保 `renderCustomComponent` 路径也正确传递 schema id 标记
- [x] 1.3 验证 `display: contents` 包裹 div 不影响现有组件的布局表现

## 2. Admin SchemaRenderer 渲染（packages/admin）

- [x] 2.1 `AppPageView` 使用 `<SchemaRenderer>` 直接渲染 App UI，通过 `schema`、`baseUrl`、`components`、`params`、`navigate` props 驱动
- [x] 2.2 渲染区域 wrapper div 添加 `id="cz-app-content"` 属性
- [x] 2.3 实现 `navigate` 回调：外部 URL 用 `window.location.href`，内部 URL 用 `useNavigate()`
- [x] 2.4 处理 App 无 UI 定义的情况，显示提示信息
- [x] 2.5 无 subPath 时自动 redirect 到首页（`<Navigate to={firstPageId} replace />`）
- [x] 2.6 使用 `useMemo` 从 `location.search` 解析 params 传入 SchemaRenderer

## 3. Admin DOM 检查 + BridgeClient（packages/admin）

- [x] 3.1 创建 `packages/admin/src/lib/ui-inspector.ts`，移植 DOM 检查逻辑（`findDirectSchemaChildren`、`extractTableData`、`extractFormData`、`extractState`、`extractActions`、`inspectElement`、`inspectPage`）
- [x] 3.2 创建 `packages/admin/src/lib/bridge-client.ts`，实现 `BridgeClient` 类：`setWebSocket()`、`setHandler()`、WebSocket 消息监听
- [x] 3.3 BridgeClient 接收 `ui:request` 消息后调用注册的 handler，将结果以 `ui:response` 回传
- [x] 3.4 在 `AppPageView` 中集成 BridgeClient：draft 模式下建立 WebSocket 连接，注册 handler 调用 `inspectPage()`
- [x] 3.5 handler 支持 `page` 参数：目标页面与当前页面不同时通过 `nav()` 切换，等待 React 重渲染后执行 DOM 检查
- [x] 3.6 使用 `subPathRef` 避免 handler 闭包中的 stale state 问题

## 4. WebSocket 中继与 Agent 工具（packages/daemon）

- [x] 4.1 在 Daemon 的 Agent WebSocket 端点上添加 `ui:request`/`ui:response` 消息类型支持：维护活跃浏览器 session，实现中继逻辑
- [x] 4.2 实现 `waitForResponse` 工具函数：通过请求 `id` 匹配 WebSocket 响应，15 秒超时
- [x] 4.3 注册 `inspect_ui` Agent 工具（Claude Agent SDK）：定义 input schema（`app_name`、`page?`），tool handler 通过 WebSocket 中继发送 `inspect` 请求
- [x] 4.4 处理无浏览器连接的情况，返回明确错误信息

## 5. 集成验证

- [x] 5.1 端到端验证：Agent 调用 `inspect_ui` → Daemon WebSocket → Admin BridgeClient → DOM 检查 → 结果原路返回
- [x] 5.2 验证 SchemaRenderer 渲染结果正确（CSS 样式、数据加载、导航）
- [x] 5.3 验证错误场景：无浏览器连接、handler 未注册、响应超时
