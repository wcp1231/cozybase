# UI Schema

## Purpose

Define the JSON schema contract for APP UI (`ui/pages.json`), including page structure, component schema, action schema, expression syntax, and custom component declarations.

## Requirements

### Requirement: pages.json 顶层结构

APP 的 UI 定义 SHALL 存储在 `ui/pages.json` 文件中。该文件 SHALL 包含以下顶层字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `pages` | `PageSchema[]` | 是 | 页面列表 |
| `components` | `Record<string, CustomComponentSchema>` | 否 | 自定义组件声明 |

系统 SHALL 在 `pages.json` 不存在或为空时不报错，该 APP 将没有 UI 界面。

#### Scenario: 完整的 pages.json 结构

- **WHEN** APP 的 `ui/pages.json` 包含 `pages` 和 `components` 字段
- **THEN** 系统 SHALL 解析 `pages` 为页面列表，`components` 为自定义组件注册表

#### Scenario: pages.json 不存在

- **WHEN** APP 没有 `ui/pages.json` 文件
- **THEN** 系统 SHALL 不报错，该 APP 在 Admin 中不显示 UI 入口

### Requirement: PageSchema 页面定义

每个页面 SHALL 符合 `PageSchema` 类型，包含以下字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 是 | 页面唯一标识，同时作为路由路径段 |
| `title` | `string` | 是 | 页面标题 |
| `body` | `ComponentSchema[]` | 是 | 页面内组件列表 |

`id` SHALL 在同一 APP 的所有页面中唯一。Admin SPA 的路由为 `/apps/:appName/:pageId`，其中 `pageId` 即为页面的 `id`。

#### Scenario: 单页面 APP

- **WHEN** `pages` 数组包含一个 `{ "id": "home", "title": "首页", "body": [...] }` 页面
- **THEN** 系统 SHALL 在路由 `/apps/:appName/home` 下渲染该页面，标题显示为"首页"

#### Scenario: 多页面 APP

- **WHEN** `pages` 数组包含两个页面，id 分别为 `home` 和 `settings`
- **THEN** 系统 SHALL 为每个 id 注册独立的页面视图

#### Scenario: 页面 id 重复

- **WHEN** 两个页面的 `id` 相同
- **THEN** 系统 SHALL 在解析时报错，提示页面 id 重复

### Requirement: ComponentSchema 组件定义

每个组件 SHALL 符合 `ComponentSchema` 类型，包含以下公共字段：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | 组件类型标识 |
| `id` | `string` | 否 | 组件唯一标识，用于跨组件引用和 action target |
| `visible` | `string \| boolean` | 否 | 可见性条件，支持 expression。默认 `true` |
| `className` | `string` | 否 | 自定义 CSS class |
| `style` | `Record<string, string>` | 否 | 自定义内联样式 |

`type` 字段 SHALL 对应内置组件或自定义组件的注册名。当 `type` 不匹配任何已注册组件时，系统 SHALL 渲染一个错误提示占位符（而非崩溃）。

除公共字段外，每种组件类型 SHALL 定义自己的扩展字段（如 `table` 的 `columns`、`form` 的 `fields` 等），在 `ui-components` spec 中定义。

#### Scenario: 带 id 的组件

- **WHEN** 组件定义包含 `{ "type": "table", "id": "todo-table", ... }`
- **THEN** 系统 SHALL 将该组件的状态注册到 PageContext 中，其他组件可通过 `${todo-table.data}` 引用

#### Scenario: 无 id 组件

- **WHEN** 组件定义不包含 `id` 字段
- **THEN** 系统 SHALL 正常渲染该组件，但该组件不可被其他组件引用

#### Scenario: 未知组件类型

- **WHEN** `type` 为 `"unknown-widget"` 且未在内置组件或自定义组件中注册
- **THEN** 系统 SHALL 渲染一个显示 "未知组件: unknown-widget" 的错误占位符，不影响其他组件渲染

#### Scenario: visible 表达式控制

- **WHEN** 组件设置 `"visible": "${status-tabs.value === '1'}"`
- **THEN** 系统 SHALL 仅在 `status-tabs` 组件的 value 等于 `'1'` 时可见

### Requirement: ActionSchema 定义

用户交互触发的行为 SHALL 通过 `ActionSchema` 声明。ActionSchema SHALL 支持以下类型：

| type | 说明 | 必填参数 | 可选参数 |
|------|------|----------|----------|
| `api` | 发起 HTTP 请求 | `method`, `url` | `body`, `onSuccess`, `onError` |
| `reload` | 刷新组件数据 | `target` | 无 |
| `dialog` | 打开弹窗 | `title`, `body` | `width` |
| `link` | 页面跳转 | `url` | `params` |
| `close` | 关闭当前弹窗 | 无 | 无 |
| `confirm` | 确认提示 | `message`, `onConfirm` | `onCancel` |

Action 的 `url` 字段 SHALL 为 App 相对路径（如 `/db/todo`、`/fn/todos`），渲染器根据当前 App 的 `baseUrl` 自动补全为完整路径。

Action 字段 SHALL 支持单个 ActionSchema 对象或 ActionSchema 数组（顺序执行）。
Action 的执行时序、副作用与错误处理语义（如 `onSuccess` / `onError`、`confirm`、`dialog`、数组顺序执行）SHALL 由 `ui-renderer` 中的 `ActionDispatcher` Requirement 定义；本 Requirement 仅定义 schema 结构与字段约束。

#### Scenario: api action 调用

- **WHEN** 按钮点击触发 `{ "type": "api", "method": "POST", "url": "/db/todo", "body": { "title": "${form.title}" } }`
- **THEN** 系统 SHALL 发起 `POST /stable/apps/{appName}/db/todo` 请求，body 中的 expression 已被解析为实际值

### Requirement: Expression 语法

系统 SHALL 支持 `${...}` 语法在组件属性值中嵌入动态表达式。Expression SHALL 支持以下作用域：

| 作用域 | 语法 | 说明 | 可用位置 |
|--------|------|------|----------|
| 组件状态 | `${componentId.value}` | 引用带 id 组件的当前值 | 任意 |
| 组件数据 | `${componentId.data}` | 引用带 id 组件的 API 数据 | 任意 |
| 行数据 | `${row.fieldName}` | 当前表格行的字段 | table 的 columns/rowActions 内 |
| 表单数据 | `${form.fieldName}` | 当前表单的字段值 | form 内 |
| URL 参数 | `${params.paramName}` | URL query 参数 | 任意 |
| 响应数据 | `${response.path}` | API 返回值 | onSuccess/onError 内 |
| Props | `${props.propName}` | 自定义组件的 props 值 | 自定义组件内 |

Expression SHALL 支持以下运算：
- 属性访问：`${row.title}`、`${response.meta.total}`
- 相等比较：`${row.completed === 1}`、`${status.value === 'active'}`
- 不等比较：`${row.completed !== 1}`
- 三元运算：`${row.completed === 1 ? '已完成' : '待完成'}`

Expression SHALL 不支持函数调用、赋值操作或其他复杂 JavaScript 语法。系统 SHALL 使用白名单解析而非 `eval()` 执行 expression。
Expression 的求值细节（求值顺序、失败回退、边界行为）SHALL 由 `ui-renderer` 中的 `ExpressionResolver` Requirement 定义；本 Requirement 仅定义语法与可用作用域。

当 expression 字符串中包含非 `${}` 包裹的文本时，SHALL 作为字符串模板处理（如 `"/db/todo/${row.id}"` 解析为 `"/db/todo/5"`）。

#### Scenario: 简单属性引用

- **WHEN** 组件属性值为 `"${row.title}"`
- **THEN** 系统 SHALL 将其替换为当前行的 `title` 字段值

#### Scenario: 字符串模板

- **WHEN** 组件属性值为 `"/db/todo/${row.id}"`
- **THEN** 系统 SHALL 保留字面量 `/db/todo/` 并将 `${row.id}` 替换为实际值，如 `/db/todo/5`

#### Scenario: 引用不存在的作用域

- **WHEN** expression 为 `"${nonexistent.value}"`，但没有 id 为 `nonexistent` 的组件
- **THEN** 系统 SHALL 返回 `undefined`，不抛出异常

#### Scenario: 嵌套属性访问

- **WHEN** expression 为 `"${response.meta.total}"`
- **THEN** 系统 SHALL 解析为 `response` 对象的 `meta.total` 路径的值

### Requirement: CustomComponentSchema 自定义组件

APP SHALL 可以在 `pages.json` 的 `components` 字段中声明自定义组件。每个自定义组件 SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `props` | `Record<string, PropDef>` | 否 | 属性定义 |
| `body` | `ComponentSchema` | 是 | 组件模板（由基础组件组合） |

`PropDef` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `"string" \| "number" \| "boolean" \| "object" \| "array" \| "action"` | 是 | 属性类型 |
| `required` | `boolean` | 否 | 是否必填，默认 `false` |
| `default` | `any` | 否 | 默认值 |

自定义组件内 SHALL 通过 `${props.xxx}` 引用 props 值。当 `props` 类型为 `action` 时，该 prop 值 SHALL 为一个 ActionSchema，在组件模板内可绑定到事件处理器。

自定义组件名 SHALL 不能与内置组件名冲突。

#### Scenario: 使用自定义组件

- **WHEN** `components` 中声明了 `"todo-card"` 组件，`pages` 中某个组件的 `type` 为 `"todo-card"`
- **THEN** 系统 SHALL 查找 `components["todo-card"]` 的模板，将传入的 props 绑定到 `${props.xxx}` 后渲染

#### Scenario: 自定义组件 props 默认值

- **WHEN** 自定义组件声明 `"completed": { "type": "boolean", "default": false }`，使用时未传入 `completed` prop
- **THEN** 系统 SHALL 使用默认值 `false`

#### Scenario: 自定义组件名与内置组件冲突

- **WHEN** `components` 中声明了名为 `"table"` 的自定义组件
- **THEN** 系统 SHALL 报错，提示自定义组件名不能与内置组件名冲突

#### Scenario: Action 类型的 prop

- **WHEN** 自定义组件声明 `"onToggle": { "type": "action" }`，使用时传入 `"onToggle": { "type": "api", "method": "PATCH", ... }`
- **THEN** 系统 SHALL 在模板内将 `${props.onToggle}` 解析为该 ActionSchema，可绑定到组件的事件属性
