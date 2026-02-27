# UI Renderer

## Purpose

Define the SchemaRenderer runtime contract, including component rendering, expression resolution, action dispatching, page context orchestration, and theming for APP UI execution.

## Requirements

### Requirement: SchemaRenderer 入口组件

SchemaRenderer SHALL 作为 `@cozybase/ui` npm 包发布，供每个 APP 的 UI 构建时打包使用，而非嵌入在 Admin SPA 中。

系统 SHALL 提供 `SchemaRenderer` 作为渲染引擎的入口 React 组件。SchemaRenderer SHALL 接受以下 props：

| Prop | 类型 | 必填 | 说明 |
|------|------|------|------|
| `schema` | `PageSchema` | 是 | 页面的 JSON schema 定义 |
| `baseUrl` | `string` | 是 | API 基址（如 `/stable/apps/welcome`） |
| `components` | `Record<string, CustomComponentSchema>` | 否 | 自定义组件注册表 |

SchemaRenderer SHALL 初始化 PageContext，将 `baseUrl` 和 `components` 注入上下文，然后递归渲染 `schema.body` 中的组件树。

SchemaRenderer SHALL 不依赖 cozybase server 的任何内部模块，仅通过 `baseUrl` + HTTP 请求与后端通信。
APP UI 构建产物与 iframe 运行协议由 `app-ui-independent` capability 规范，本 Requirement 仅定义 SchemaRenderer 的渲染职责。

#### Scenario: 基本渲染

- **WHEN** 传入 schema 包含 `body: [{ "type": "text", "text": "Hello" }]`，baseUrl 为 `/stable/apps/welcome`
- **THEN** SchemaRenderer SHALL 渲染出一个显示 "Hello" 的文本组件

#### Scenario: 嵌套组件渲染

- **WHEN** schema.body 包含 `{ "type": "card", "children": [{ "type": "text", "text": "内容" }] }`
- **THEN** SchemaRenderer SHALL 递归渲染 card 组件及其子组件 text

#### Scenario: 渲染出错不崩溃

- **WHEN** schema.body 中某个组件渲染时抛出异常
- **THEN** SchemaRenderer SHALL 捕获该异常，渲染一个错误提示占位符，其他组件不受影响

### Requirement: ComponentRegistry 组件注册表

系统 SHALL 维护一个 ComponentRegistry，将 `type` 字符串映射到对应的 React 组件实现。

ComponentRegistry SHALL 提供以下能力：
- 注册内置组件：在初始化时注册所有内置组件类型
- 查询组件：根据 `type` 字符串获取对应的 React 组件
- 自定义组件集成：当 `type` 不在内置组件中时，查找 `components` 注册表中的自定义组件模板

查找优先级 SHALL 为：内置组件 > 自定义组件 > 错误占位符。

#### Scenario: 查找内置组件

- **WHEN** 渲染器遇到 `{ "type": "table", ... }`
- **THEN** ComponentRegistry SHALL 返回内置的 Table React 组件

#### Scenario: 查找自定义组件

- **WHEN** 渲染器遇到 `{ "type": "todo-card", ... }`，内置组件中无 `todo-card`，但 `components` 中已声明
- **THEN** ComponentRegistry SHALL 返回自定义组件的模板渲染器，展开模板并绑定 props

#### Scenario: 未知组件

- **WHEN** 渲染器遇到 `{ "type": "nonexistent", ... }`，内置和自定义组件中均无匹配
- **THEN** ComponentRegistry SHALL 返回一个错误占位符组件

### Requirement: ExpressionResolver 表达式解析器

系统 SHALL 提供 ExpressionResolver 模块，负责解析和求值 `${...}` 表达式。

ExpressionResolver SHALL 接收以下参数：
- `expression: string` — 包含 `${...}` 的字符串
- `context: ExpressionContext` — 当前可用的作用域数据

ExpressionContext SHALL 包含以下可选作用域：
- `components: Record<string, { value?: any, data?: any }>` — 有 id 组件的状态
- `row: Record<string, any>` — 表格当前行数据
- `form: Record<string, any>` — 表单当前值
- `params: Record<string, string>` — URL query 参数
- `response: any` — API 响应数据
- `props: Record<string, any>` — 自定义组件 props

ExpressionResolver SHALL 使用白名单解析方式，不使用 `eval()` 或 `new Function()`。

当表达式解析失败或引用不存在的路径时，SHALL 返回 `undefined`，不抛出异常。

#### Scenario: 纯表达式解析

- **WHEN** expression 为 `"${row.title}"`，context.row 为 `{ "title": "买菜", "completed": 0 }`
- **THEN** ExpressionResolver SHALL 返回字符串 `"买菜"`

#### Scenario: 字符串模板解析

- **WHEN** expression 为 `"/db/todo/${row.id}"`，context.row 为 `{ "id": 5 }`
- **THEN** ExpressionResolver SHALL 返回 `"/db/todo/5"`

#### Scenario: 比较表达式

- **WHEN** expression 为 `"${row.completed === 1}"`，context.row 为 `{ "completed": 0 }`
- **THEN** ExpressionResolver SHALL 返回 `false`

#### Scenario: 三元表达式

- **WHEN** expression 为 `"${row.completed === 1 ? '完成' : '待办'}"`，context.row 为 `{ "completed": 1 }`
- **THEN** ExpressionResolver SHALL 返回 `"完成"`

#### Scenario: 跨组件引用

- **WHEN** expression 为 `"${status-tabs.value}"`，context.components 中 `status-tabs` 的 value 为 `"1"`
- **THEN** ExpressionResolver SHALL 返回 `"1"`

#### Scenario: 嵌套路径访问

- **WHEN** expression 为 `"${response.meta.total}"`，context.response 为 `{ "meta": { "total": 42 } }`
- **THEN** ExpressionResolver SHALL 返回 `42`

#### Scenario: 引用不存在的路径

- **WHEN** expression 为 `"${row.nonexistent}"`，context.row 不包含 `nonexistent` 字段
- **THEN** ExpressionResolver SHALL 返回 `undefined`

#### Scenario: 非表达式字符串

- **WHEN** expression 为 `"普通文本"` 不包含 `${}`
- **THEN** ExpressionResolver SHALL 原样返回 `"普通文本"`

### Requirement: ActionDispatcher 行为派发器

系统 SHALL 提供 ActionDispatcher 模块，负责执行 ActionSchema 声明的行为。

ActionDispatcher SHALL 接收以下参数：
- `action: ActionSchema | ActionSchema[]` — 要执行的 action
- `context: ActionContext` — 执行上下文（包含 baseUrl、当前可用的 expression context、PageContext 引用）

ActionDispatcher SHALL 依次处理以下 action 类型：

**api**: 使用 `fetch()` 发起 HTTP 请求。URL SHALL 以 `baseUrl` 为前缀自动补全。请求体和 URL 中的 expression SHALL 在发送前解析。请求完成后，根据结果执行 `onSuccess` 或 `onError` 中的 action 链。

**reload**: 通知 PageContext 中 `target` 对应的组件重新获取数据。

**dialog**: 在 PageContext 中注册一个弹窗，将 `body` 的 ComponentSchema 作为弹窗内容渲染。

**link**: 执行页面内导航或外部跳转。

**close**: 关闭当前弹窗上下文。

**confirm**: 弹出浏览器或自定义确认对话框，用户确认后执行 `onConfirm`，取消后执行 `onCancel`（如有）。

当 action 为数组时，SHALL 按顺序依次执行。前一个 action 失败时 SHALL 中断后续执行（api action 的失败走 onError 路径，不中断数组执行）。

#### Scenario: api action 请求

- **WHEN** 执行 `{ "type": "api", "method": "POST", "url": "/db/todo", "body": { "title": "新任务" } }`，baseUrl 为 `/stable/apps/welcome`
- **THEN** ActionDispatcher SHALL 发起 `POST /stable/apps/welcome/db/todo` 请求，body 为 `{ "title": "新任务" }`

#### Scenario: api action URL 自动补全

- **WHEN** action url 为 `/db/todo`，baseUrl 为 `/stable/apps/welcome`
- **THEN** ActionDispatcher SHALL 将请求 URL 补全为 `/stable/apps/welcome/db/todo`

#### Scenario: api action onSuccess 链

- **WHEN** api 请求成功，onSuccess 为 `[{ "type": "reload", "target": "table1" }, { "type": "close" }]`
- **THEN** ActionDispatcher SHALL 先触发 table1 的 reload，再关闭弹窗

#### Scenario: reload action

- **WHEN** 执行 `{ "type": "reload", "target": "todo-table" }`
- **THEN** ActionDispatcher SHALL 通知 PageContext 中 id 为 `todo-table` 的组件重新执行其 `api` 配置获取最新数据

#### Scenario: dialog action

- **WHEN** 执行 `{ "type": "dialog", "title": "编辑", "body": { "type": "form", ... } }`
- **THEN** ActionDispatcher SHALL 打开一个弹窗，标题为"编辑"，内容为 body 中的 form 组件

#### Scenario: confirm action 用户确认

- **WHEN** 执行 confirm action，用户点击"确认"
- **THEN** ActionDispatcher SHALL 执行 `onConfirm` 中的 action

#### Scenario: confirm action 用户取消

- **WHEN** 执行 confirm action，用户点击"取消"
- **THEN** ActionDispatcher SHALL 不执行 `onConfirm`，执行 `onCancel`（如有定义）

#### Scenario: action 数组顺序执行

- **WHEN** 执行 action 数组 `[actionA, actionB, actionC]`
- **THEN** ActionDispatcher SHALL 按顺序执行 actionA → actionB → actionC

### Requirement: PageContext 页面上下文

PageContext 的 `baseUrl` SHALL 指向 APP 自身的 Runtime 路由，而非 Admin 的 API 代理。

系统 SHALL 维护 PageContext 作为页面级别的状态中心，使用 React Context 实现。

PageContext SHALL 提供以下能力：

**组件状态注册**: 带 `id` 的组件 SHALL 在挂载时向 PageContext 注册自身的状态（`value`、`data`、`loading` 等），卸载时注销。

**跨组件引用**: 任何组件可通过 `${componentId.value}` 或 `${componentId.data}` 引用其他已注册组件的状态。PageContext SHALL 在被引用组件状态变化时通知引用方重新渲染。

**Reload 机制**: PageContext SHALL 维护一个 reload 信号机制。当 ActionDispatcher 触发 reload 时，PageContext SHALL 通知目标组件重新获取数据。

**Dialog 管理**: PageContext SHALL 维护一个弹窗栈（dialog stack），支持多层弹窗的打开和关闭。

**API 基址**: PageContext SHALL 存储当前 App 的 `baseUrl`，所有 api action 共用。

#### Scenario: baseUrl 指向 Runtime
- **WHEN** SchemaRenderer 在 APP UI 中初始化
- **THEN** `baseUrl` 设置为 APP 自身的 Runtime 前缀（如 `/stable/apps/todo`），API 调用直接发往 Runtime 路由

#### Scenario: API 请求路由
- **WHEN** ActionDispatcher 执行 `api` 类型的 action
- **THEN** 请求发往 `{baseUrl}/fn/{fnName}` 或 `{baseUrl}/db/{table}`，由 Runtime 处理

#### Scenario: 组件注册状态

- **WHEN** id 为 `"status-tabs"` 的 tabs 组件挂载，当前值为 `"all"`
- **THEN** PageContext SHALL 注册 `{ "status-tabs": { value: "all" } }`，其他组件可通过 `${status-tabs.value}` 获取

#### Scenario: 组件状态更新传播

- **WHEN** `status-tabs` 的值从 `"all"` 变为 `"completed"`
- **THEN** PageContext SHALL 通知所有引用 `${status-tabs.value}` 的组件重新渲染

#### Scenario: 组件卸载注销

- **WHEN** id 为 `"status-tabs"` 的组件卸载
- **THEN** PageContext SHALL 移除该组件的注册，后续引用 `${status-tabs.value}` SHALL 返回 `undefined`

#### Scenario: reload 信号

- **WHEN** ActionDispatcher 触发 `{ "type": "reload", "target": "todo-table" }`
- **THEN** PageContext SHALL 向 id 为 `todo-table` 的组件发送 reload 信号，该组件 SHALL 重新执行其 api 获取数据

#### Scenario: 弹窗栈管理

- **WHEN** 先打开 dialog A，再在 dialog A 内打开 dialog B
- **THEN** PageContext SHALL 维护弹窗栈 `[A, B]`，关闭 B 后恢复只显示 A

#### Scenario: reload 目标不存在

- **WHEN** ActionDispatcher 触发 reload，但 target 对应的组件不存在
- **THEN** PageContext SHALL 忽略该 reload，不报错

### Requirement: 主题支持

SchemaRenderer SHALL 支持通过 CSS Variables 接收主题配置，以便在 iframe 嵌入时与 Admin 保持视觉一致。

#### Scenario: 接收 postMessage 主题更新
- **WHEN** APP UI 运行在 iframe 中，收到 Admin 发送的 `theme-update` postMessage
- **THEN** SchemaRenderer 更新根元素的 CSS Variables，所有使用 CSS Variables 的组件样式自动更新

#### Scenario: 默认主题
- **WHEN** APP UI 独立运行（非 iframe）
- **THEN** SchemaRenderer 使用内置的默认主题 CSS Variables 渲染
