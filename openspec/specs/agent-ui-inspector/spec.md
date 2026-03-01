# Agent UI Inspector

## Purpose

定义 Agent 如何通过 Admin 中直接渲染的 App UI 获取结构化页面状态，并约束对应的 WebSocket 中继与浏览器侧检查行为。

## Requirements

### Requirement: SchemaRenderer 直接渲染 App UI

`AppPageView` SHALL 使用 `<SchemaRenderer>` 直接渲染 App UI，通过 `schema`、`baseUrl`、`components`、`params`、`navigate` 等 props 驱动。

渲染区域 wrapper div SHALL 包含 `id="cz-app-content"` 属性，供 DOM 检查定位根元素。

App UI SHALL 与 Admin UI 共享同一个 React 树和 CSS 上下文。

#### Scenario: 用户访问 draft 模式下的 App 页面

- **WHEN** 用户导航到 `/draft/apps/my-app/users`
- **THEN** `AppPageView` SHALL 渲染 `<SchemaRenderer schema={usersPage} baseUrl="/draft/apps/my-app" ...>`
- **AND** SchemaRenderer SHALL 占满内容区域

#### Scenario: App 无 UI 定义

- **WHEN** 用户导航到一个没有 UI 定义的 App
- **THEN** `AppPageView` SHALL 显示 "该 App 暂无 UI 界面" 提示信息

#### Scenario: 加载期间显示 skeleton

- **WHEN** App 数据正在加载中
- **THEN** SHALL 显示 loading skeleton 占位
- **AND** 数据加载完成后 SHALL 切换为显示 SchemaRenderer 内容

### Requirement: Admin 导航通过 React Router

Admin sidebar 的页面导航 SHALL 通过 React Router 直接控制：sidebar 点击 → URL 变化 → `subPath` 参数更新 → 渲染对应 page schema。

App 内部 Link 组件点击 SHALL 通过 SchemaRenderer 的 `navigate` 回调调用 `useNavigate()`。

Agent 请求 inspect 指定页面 SHALL 通过 BridgeClient handler 调用 `nav()` 切换页面。

#### Scenario: 用户在 sidebar 切换页面

- **WHEN** 用户点击 sidebar 中的页面链接（如从 `users` 切换到 `settings`）
- **THEN** React Router URL SHALL 更新为 `/{mode}/apps/{appName}/settings`
- **AND** SchemaRenderer SHALL 渲染 settings 页面的 schema

#### Scenario: App 内部 Link 组件导航

- **WHEN** 用户点击 App UI 中的 Link 组件（如 `/records?baby_id=1`）
- **THEN** Admin URL SHALL 更新为 `/draft/apps/{appName}/records?baby_id=1`
- **AND** SchemaRenderer SHALL 渲染 records 页面，params 包含 `baby_id=1`

#### Scenario: 用户切换不同 APP

- **WHEN** 用户从 `app-a` 导航到 `app-b`
- **THEN** SchemaRenderer SHALL 重新渲染 `app-b` 的首页

### Requirement: data-schema-id 组件标记

`NodeRenderer` SHALL 为每个渲染的 schema 组件添加 `data-schema-id` 和 `data-schema-type` 属性。

如果 schema 节点包含 `id` 字段，SHALL 使用该 `id` 作为 `data-schema-id` 的值。

如果 schema 节点无 `id` 字段，SHALL 使用 `{type}-{siblingIndex}` 格式自动生成（如 `heading-0`、`button-1`），其中 `siblingIndex` 为该节点在同级兄弟节点中的索引。

标记 SHALL 通过一个 `display: contents` 的包裹 `<div>` 元素实现，避免影响布局。

#### Scenario: 带 id 的 schema 节点

- **WHEN** schema 中包含 `{ "type": "table", "id": "users-table", ... }`
- **THEN** 渲染的 DOM 中 SHALL 存在 `<div data-schema-id="users-table" data-schema-type="table" style="display: contents">` 包裹该组件

#### Scenario: 无 id 的 schema 节点

- **WHEN** schema body 中第一个节点为 `{ "type": "heading", "text": "用户管理" }`（无 `id` 字段）
- **THEN** 渲染的 DOM 中 SHALL 存在 `<div data-schema-id="heading-0" data-schema-type="heading" style="display: contents">` 包裹该组件

#### Scenario: 包裹 div 不影响布局

- **WHEN** `data-schema-id` 包裹 div 被添加到组件外层
- **THEN** 页面布局 SHALL 与未添加包裹 div 时完全一致（通过 `display: contents` 实现）

### Requirement: inspect 方法

DOM 检查逻辑 SHALL 支持 `inspect` 方法，遍历 DOM 中所有带 `data-schema-id` 属性的元素，生成结构化的 UI 状态树。

返回的 `InspectResult` SHALL 包含 `page` 对象（`id` 和 `title`）和 `tree` 数组（`InspectNode` 列表）。

每个 `InspectNode` SHALL 包含：`schemaId`（`data-schema-id` 值）、`type`（组件类型）、`visible`（是否可见）。

对于文本类组件（`heading`、`text`、`button`、`tag`、`stat`），`InspectNode` SHALL 包含 `text` 字段，值为渲染后的文本内容。

对于 `table` 组件，`InspectNode` SHALL 包含 `data` 字段，其中 `columns` 为列名数组，`rows` 为行数，`items` 为前 5 行数据预览。

对于 `form` 组件，`InspectNode` SHALL 包含 `form` 字段，其中 `fields` 为字段名列表，`values` 为当前表单值。

对于包含 `action` 的组件，`InspectNode` SHALL 包含 `actions` 字段，列出可用 action 的描述文本。

`InspectNode` SHALL 包含 `state` 字段表示组件状态（`loading`、`error`、`disabled`）。

对于包含子组件的容器（`card`、`row`、`col`、`page`、`tabs`），`InspectNode` SHALL 包含 `children` 字段。

嵌套深度 SHALL 限制为最多 10 层。

#### Scenario: inspect 包含文本类组件的 heading

- **WHEN** 页面包含 `{ "type": "heading", "id": "title", "text": "用户管理" }`
- **AND** Agent 调用 `inspect`
- **THEN** 返回的 tree 中 SHALL 包含 `{ schemaId: "title", type: "heading", text: "用户管理", visible: true }`

#### Scenario: inspect 包含 table 的数据预览

- **WHEN** 页面包含一个 table 组件，已加载 20 行数据，列为 `["id", "name", "role"]`
- **AND** Agent 调用 `inspect`
- **THEN** 返回的 table 节点 SHALL 包含 `data: { rows: 20, columns: ["id", "name", "role"], items: [前5行数据] }`

#### Scenario: inspect 包含 form 状态

- **WHEN** 页面包含一个 form 组件，字段为 `name` 和 `email`，用户已填入 `name: "Alice"`
- **AND** Agent 调用 `inspect`
- **THEN** 返回的 form 节点 SHALL 包含 `form: { fields: ["name", "email"], values: { name: "Alice", email: "" } }`

#### Scenario: inspect 包含 loading 状态的 table

- **WHEN** 页面包含一个 table 组件正在加载数据
- **AND** Agent 调用 `inspect`
- **THEN** 返回的 table 节点 SHALL 包含 `state: { loading: true }`

#### Scenario: inspect 不返回 visible=false 的组件

- **WHEN** 页面包含一个 `visible: "${params.showAdmin}"` 的组件，当前 `params.showAdmin` 为 `false`
- **AND** Agent 调用 `inspect`
- **THEN** 返回的 tree 中 SHALL NOT 包含该组件（因为 DOM 中不存在）

### Requirement: WebSocket 中继 UI 工具请求

Daemon SHALL 在 Agent WebSocket 连接上支持 `ui:request` 类型消息的中继。

当 Agent tool handler 需要调用 UI 工具时，SHALL 通过 WebSocket 向已连接的 Admin UI 浏览器发送 `UiToolRequest` 消息（`type: 'ui:request'`、`id`、`method`、`params`）。

Daemon SHALL 等待浏览器通过 WebSocket 返回对应 `id` 的 `UiToolResponse` 消息（`type: 'ui:response'`、`id`、`result` 或 `error`）。

等待超时时间 SHALL 为 15 秒。超时后 SHALL 向 Agent 返回超时错误。

#### Scenario: UI 工具请求成功中继

- **WHEN** Agent 调用 `inspect_ui` 工具
- **AND** Admin UI 浏览器已通过 WebSocket 连接
- **THEN** Daemon SHALL 向浏览器发送 `ui:request` 消息
- **AND** 浏览器返回 `ui:response` 后 SHALL 将 `result` 返回给 Agent

#### Scenario: 无浏览器连接时返回错误

- **WHEN** Agent 调用 `inspect_ui` 工具
- **AND** 没有 Admin UI 浏览器通过 WebSocket 连接
- **THEN** tool handler SHALL 返回错误信息 `"No browser session connected. Please open Admin UI to use UI inspection tools."`

#### Scenario: 浏览器响应超时

- **WHEN** Agent 调用 `inspect_ui` 工具
- **AND** Admin UI 浏览器已连接但 15 秒内未返回响应
- **THEN** tool handler SHALL 返回超时错误

### Requirement: inspect_ui Agent 工具

Daemon SHALL 为 Agent 注册 `inspect_ui` 工具，参数为 `{ app_name: string, page?: string }`。

工具描述 SHALL 说明该工具用于检查 draft App 的已渲染 UI，返回组件结构树、文本内容、表格数据、表单状态和可用 action。

调用时，tool handler SHALL 通过 WebSocket 中继向浏览器端发送 `inspect` 请求，等待响应后将 `InspectResult` 返回给 Agent。

#### Scenario: Agent 调用 inspect_ui 成功

- **WHEN** Agent 调用 `inspect_ui(app_name: "my-app")`
- **AND** Admin UI 已打开且 SchemaRenderer 正在渲染 `my-app` 的 UI
- **THEN** 工具 SHALL 返回 `InspectResult`，包含页面的组件结构树

#### Scenario: Agent 调用 inspect_ui 指定页面

- **WHEN** Agent 调用 `inspect_ui(app_name: "my-app", page: "settings")`
- **THEN** BridgeClient handler SHALL 通过 React Router 导航到 settings 页面后执行 DOM 检查
- **AND** 返回 settings 页面的 `InspectResult`

### Requirement: BridgeClient WebSocket 通信

Admin 端的 `BridgeClient` SHALL 管理 WebSocket 连接（与 Daemon 通信），接收 `ui:request` 消息后调用注册的 handler 执行检查，将结果以 `ui:response` 回传。

`BridgeClient` SHALL 通过 `setWebSocket()` 接收 WebSocket 实例，通过 `setHandler()` 注册请求处理函数。

handler 接收 `(method: string, params: Record<string, unknown>)` 并返回 `Promise<unknown>`。

#### Scenario: BridgeClient 处理 inspect 请求

- **WHEN** BridgeClient 从 WebSocket 收到 `{ type: 'ui:request', id: 'req-1', method: 'inspect', params: { page: 'users' } }`
- **THEN** BridgeClient SHALL 调用注册的 handler `handler('inspect', { page: 'users' })`
- **AND** handler 执行 DOM 检查后 SHALL 通过 WebSocket 发送 `{ type: 'ui:response', id: 'req-1', result: ... }`

#### Scenario: 无 handler 注册时返回错误

- **WHEN** BridgeClient 从 WebSocket 收到 `ui:request`
- **AND** 未注册 handler
- **THEN** BridgeClient SHALL 通过 WebSocket 返回 `{ type: 'ui:response', id: '...', error: 'No handler registered' }`

#### Scenario: handler 抛出异常

- **WHEN** BridgeClient 调用 handler 时 handler 抛出异常
- **THEN** BridgeClient SHALL 通过 WebSocket 返回 `{ type: 'ui:response', id: '...', error: '<异常信息>' }`
