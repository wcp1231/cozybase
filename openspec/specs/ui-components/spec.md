# UI Components

## Purpose

Define the built-in UI component set, including layout, data display, data input, and interaction components, plus their schema fields and expected runtime behavior.

## Requirements

### Requirement: 布局组件 — page

`page` 组件 SHALL 作为页面的顶层容器，自动占满可用宽度。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 否 | 页面标题（覆盖 PageSchema 的 title） |
| `children` | `ComponentSchema[]` | 是 | 子组件列表 |

`page` 组件 SHALL 以垂直方向排列子组件，默认间距由系统统一设定。

#### Scenario: page 渲染

- **WHEN** 渲染 `{ "type": "page", "children": [{ "type": "heading", "text": "标题" }] }`
- **THEN** 系统 SHALL 渲染一个全宽容器，内部垂直排列子组件

### Requirement: 布局组件 — row

`row` 组件 SHALL 以水平方向排列子组件。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `children` | `ComponentSchema[]` | 是 | 子组件列表 |
| `justify` | `string` | 否 | 水平对齐方式：`start`（默认）、`end`、`center`、`space-between`、`space-around` |
| `align` | `string` | 否 | 垂直对齐方式：`start`、`center`（默认）、`end`、`stretch` |
| `gap` | `number` | 否 | 子组件间距（px），默认 `8` |
| `wrap` | `boolean` | 否 | 是否换行，默认 `false` |

#### Scenario: row 水平排列

- **WHEN** 渲染 `{ "type": "row", "children": [A, B, C] }`
- **THEN** 系统 SHALL 将 A、B、C 水平排列，默认间距 8px

#### Scenario: row 两端对齐

- **WHEN** 渲染 `{ "type": "row", "justify": "space-between", "children": [A, B] }`
- **THEN** 系统 SHALL 将 A 靠左、B 靠右

### Requirement: 布局组件 — col

`col` 组件 SHALL 以垂直方向排列子组件。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `children` | `ComponentSchema[]` | 是 | 子组件列表 |
| `align` | `string` | 否 | 水平对齐方式：`start`（默认）、`center`、`end`、`stretch` |
| `gap` | `number` | 否 | 子组件间距（px），默认 `8` |

#### Scenario: col 垂直排列

- **WHEN** 渲染 `{ "type": "col", "gap": 16, "children": [A, B] }`
- **THEN** 系统 SHALL 将 A、B 垂直排列，间距 16px

### Requirement: 布局组件 — card

`card` 组件 SHALL 渲染带边框和阴影的卡片容器。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 否 | 卡片标题 |
| `children` | `ComponentSchema[]` | 是 | 卡片内容 |
| `padding` | `number` | 否 | 内边距（px），默认 `16` |

#### Scenario: 带标题的 card

- **WHEN** 渲染 `{ "type": "card", "title": "用户信息", "children": [...] }`
- **THEN** 系统 SHALL 渲染一个带 "用户信息" 标题和边框阴影的卡片

#### Scenario: 无标题 card

- **WHEN** 渲染 `{ "type": "card", "children": [...] }` 不含 title
- **THEN** 系统 SHALL 渲染无标题的卡片容器

### Requirement: 布局组件 — tabs

`tabs` 组件 SHALL 渲染标签页切换器。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `items` | `TabItem[]` | 是 | 标签项列表 |
| `defaultValue` | `string` | 否 | 默认选中的 tab value，默认第一个 |

`TabItem` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 是 | 标签显示文本 |
| `value` | `string` | 是 | 标签值 |
| `body` | `ComponentSchema[]` | 否 | 该 tab 下的内容（如有） |

当 tabs 组件有 `id` 时，其 `value` SHALL 注册到 PageContext，供其他组件通过 `${tabsId.value}` 引用。

tabs 组件有两种使用模式：
1. **有 body 的 tabs**：每个 tab 切换时显示对应 body 内容
2. **无 body 的 tabs**：仅作为筛选器使用，通过 `${tabsId.value}` 驱动其他组件

#### Scenario: tabs 作为筛选器

- **WHEN** 渲染 `{ "type": "tabs", "id": "filter", "items": [{ "label": "全部", "value": "" }, { "label": "完成", "value": "1" }] }`
- **THEN** 系统 SHALL 渲染标签切换器，切换时更新 PageContext 中的 `filter.value`

#### Scenario: tabs 带内容

- **WHEN** tabs 的某个 item 包含 `"body": [{ "type": "text", "text": "内容" }]`
- **THEN** 系统 SHALL 在选中该 tab 时渲染对应的 body 内容

### Requirement: 布局组件 — divider

`divider` 组件 SHALL 渲染水平分隔线。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 否 | 分隔线中间的文字 |

#### Scenario: 简单分隔线

- **WHEN** 渲染 `{ "type": "divider" }`
- **THEN** 系统 SHALL 渲染一条水平分隔线

### Requirement: 数据展示组件 — table

`table` 组件 SHALL 渲染数据表格，支持从 API 获取数据。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api` | `ApiConfig` | 是 | 数据源配置 |
| `columns` | `ColumnSchema[]` | 是 | 列定义 |
| `rowActions` | `RowActionSchema[]` | 否 | 行级操作按钮 |
| `pagination` | `boolean` | 否 | 是否分页，默认 `true` |
| `pageSize` | `number` | 否 | 每页条数，默认 `20` |

`ApiConfig` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `method` | `string` | 否 | HTTP 方法，默认 `GET` |
| `url` | `string` | 是 | API 路径（App 相对路径） |
| `params` | `Record<string, string>` | 否 | 查询参数，支持 expression |

`ColumnSchema` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 数据字段名 |
| `label` | `string` | 是 | 列标题 |
| `render` | `ComponentSchema` | 否 | 自定义列渲染组件 |
| `width` | `number \| string` | 否 | 列宽 |

`RowActionSchema` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 是 | 按钮文本 |
| `action` | `ActionSchema` | 是 | 点击行为 |
| `confirm` | `string` | 否 | 确认提示文字（如有，点击时先弹确认） |

table 组件有 `id` 时，SHALL 将 `data`（当前页数据）和 `loading` 状态注册到 PageContext。

table 组件 SHALL 在挂载时自动获取数据。api.params 中的 expression 值变化时，SHALL 自动重新获取数据。

#### Scenario: table 加载数据

- **WHEN** 渲染 table 组件，api 为 `{ "url": "/db/todo", "params": { "order": "created_at.desc" } }`
- **THEN** 系统 SHALL 发起 `GET /stable/apps/{appName}/db/todo?order=created_at.desc`，将返回数据渲染为表格

#### Scenario: table 自定义列渲染

- **WHEN** column 定义 `{ "name": "completed", "label": "状态", "render": { "type": "switch", "onChange": { ... } } }`
- **THEN** 系统 SHALL 在该列渲染 switch 组件，switch 的值绑定到 `row.completed`

#### Scenario: table 行操作

- **WHEN** rowActions 包含 `{ "label": "删除", "confirm": "确认删除？", "action": { "type": "api", ... } }`
- **THEN** 系统 SHALL 在每行末尾渲染"删除"按钮，点击后先弹确认框，确认后执行 api action

#### Scenario: table 分页

- **WHEN** table 配置 `"pagination": true, "pageSize": 10`，数据总量超过 10 条
- **THEN** 系统 SHALL 在 api 请求中添加 `limit=10&offset=0` 参数，渲染分页控件

#### Scenario: table 响应筛选条件变化

- **WHEN** table 的 api.params 包含 `"where": "completed.eq.${filter.value}"`，filter 组件的 value 从 `""` 变为 `"1"`
- **THEN** 系统 SHALL 自动重新发起请求，params 中的 expression 更新为新值

### Requirement: 数据展示组件 — list

`list` 组件 SHALL 渲染列表视图，用于卡片式数据展示。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `api` | `ApiConfig` | 是 | 数据源配置 |
| `itemRender` | `ComponentSchema` | 是 | 列表项渲染模板（可使用 `${row.xxx}` 引用当前项数据） |

#### Scenario: list 渲染

- **WHEN** api 返回 3 条数据，itemRender 为 `{ "type": "card", "children": [{ "type": "text", "text": "${row.title}" }] }`
- **THEN** 系统 SHALL 为每条数据渲染一个 card，card 内的 text 显示对应的 title

### Requirement: 数据展示组件 — text

`text` 组件 SHALL 渲染文本内容。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 文本内容，支持 expression |

#### Scenario: text 渲染

- **WHEN** 渲染 `{ "type": "text", "text": "共 ${response.meta.total} 条" }`
- **THEN** 系统 SHALL 渲染解析后的文本，如 "共 42 条"

### Requirement: 数据展示组件 — heading

`heading` 组件 SHALL 渲染标题。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 标题文本，支持 expression |
| `level` | `number` | 否 | 标题级别 1-6，默认 `2` |

#### Scenario: heading 渲染

- **WHEN** 渲染 `{ "type": "heading", "level": 3, "text": "待办事项" }`
- **THEN** 系统 SHALL 渲染一个 h3 标签，内容为 "待办事项"

### Requirement: 数据展示组件 — tag

`tag` 组件 SHALL 渲染状态标签。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 标签文本 |
| `color` | `string` | 否 | 标签颜色：`default`、`success`、`warning`、`error`、`info` |

#### Scenario: tag 渲染

- **WHEN** 渲染 `{ "type": "tag", "text": "已完成", "color": "success" }`
- **THEN** 系统 SHALL 渲染一个绿色的 "已完成" 标签

### Requirement: 数据展示组件 — stat

`stat` 组件 SHALL 渲染统计指标卡。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 是 | 指标名称 |
| `value` | `string \| number` | 是 | 指标值，支持 expression |
| `prefix` | `string` | 否 | 值前缀 |
| `suffix` | `string` | 否 | 值后缀 |

#### Scenario: stat 渲染

- **WHEN** 渲染 `{ "type": "stat", "label": "总任务", "value": "${todo-table.data.length}", "suffix": "个" }`
- **THEN** 系统 SHALL 渲染一个统计卡，上方为"总任务"，下方为数值加"个"后缀

### Requirement: 数据输入组件 — form

`form` 组件 SHALL 渲染表单，管理表单字段状态并支持提交。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `fields` | `FieldSchema[]` | 是 | 表单字段列表 |
| `api` | `ApiConfig` | 否 | 提交目标 API |
| `onSuccess` | `ActionSchema \| ActionSchema[]` | 否 | 提交成功后执行的 action |
| `onError` | `ActionSchema \| ActionSchema[]` | 否 | 提交失败后执行的 action |
| `initialValues` | `Record<string, any>` | 否 | 初始值，支持 expression |
| `layout` | `string` | 否 | 布局方式：`vertical`（默认）、`horizontal`、`inline` |

`FieldSchema` SHALL 包含：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 字段名 |
| `label` | `string` | 否 | 字段标签 |
| `type` | `string` | 是 | 字段输入类型 |
| `required` | `boolean` | 否 | 是否必填，默认 `false` |
| `placeholder` | `string` | 否 | 占位文字 |
| `options` | `OptionItem[]` | 否 | 选项列表（select/radio/checkbox 使用） |
| `defaultValue` | `any` | 否 | 默认值 |

`FieldSchema.type` SHALL 对应输入组件类型：`input`、`textarea`、`number`、`select`、`switch`、`checkbox`、`radio`、`date-picker`。

form 有 `id` 时，SHALL 将当前表单值注册到 PageContext，供其他组件通过 `${formId.value}` 或 `${form.fieldName}` 引用。

#### Scenario: form 提交

- **WHEN** form 配置 api 为 `{ "method": "POST", "url": "/db/todo" }`，用户填写字段后提交
- **THEN** 系统 SHALL 将表单数据作为 body 发起 POST 请求

#### Scenario: form 验证

- **WHEN** 字段配置 `"required": true`，用户未填写该字段就提交
- **THEN** 系统 SHALL 阻止提交并在该字段下显示错误提示

#### Scenario: form 提交成功回调

- **WHEN** form 配置 `"onSuccess": [{ "type": "reload", "target": "table1" }, { "type": "close" }]`，提交成功
- **THEN** 系统 SHALL 依次执行 reload table1 和关闭弹窗

### Requirement: 数据输入组件 — input

`input` 组件 SHALL 渲染单行文本输入框。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前值，支持 expression |
| `placeholder` | `string` | 否 | 占位文字 |
| `onChange` | `ActionSchema` | 否 | 值变化时触发的 action |

input 在 form 内时 SHALL 自动与 form 的状态管理集成，无需额外配置。

#### Scenario: input 独立使用

- **WHEN** 渲染 `{ "type": "input", "id": "search", "placeholder": "搜索..." }`
- **THEN** 系统 SHALL 渲染输入框，输入时更新 PageContext 中 `search.value`

### Requirement: 数据输入组件 — textarea

`textarea` 组件 SHALL 渲染多行文本输入框。属性与 `input` 相同，额外支持 `rows`（行数，默认 `3`）。

#### Scenario: textarea 渲染

- **WHEN** 渲染 `{ "type": "textarea", "rows": 5, "placeholder": "请输入描述..." }`
- **THEN** 系统 SHALL 渲染 5 行高的多行文本框

### Requirement: 数据输入组件 — number

`number` 组件 SHALL 渲染数字输入框。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `number` | 否 | 当前值 |
| `min` | `number` | 否 | 最小值 |
| `max` | `number` | 否 | 最大值 |
| `step` | `number` | 否 | 步长，默认 `1` |

#### Scenario: number 带范围

- **WHEN** 渲染 `{ "type": "number", "min": 0, "max": 100, "step": 5 }`
- **THEN** 系统 SHALL 渲染数字输入框，限制输入范围为 0-100，步长为 5

### Requirement: 数据输入组件 — select

`select` 组件 SHALL 渲染下拉选择框。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string \| string[]` | 否 | 当前选中值 |
| `options` | `OptionItem[]` | 是 | 选项列表 |
| `multiple` | `boolean` | 否 | 是否多选，默认 `false` |
| `placeholder` | `string` | 否 | 占位文字 |
| `onChange` | `ActionSchema` | 否 | 值变化时触发的 action |

`OptionItem` SHALL 包含 `{ "label": string, "value": string }`。

#### Scenario: select 单选

- **WHEN** 渲染 `{ "type": "select", "options": [{ "label": "高", "value": "high" }, { "label": "低", "value": "low" }] }`
- **THEN** 系统 SHALL 渲染下拉框，包含"高"和"低"两个选项

### Requirement: 数据输入组件 — switch

`switch` 组件 SHALL 渲染开关切换器。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `boolean` | 否 | 当前值 |
| `onChange` | `ActionSchema` | 否 | 值变化时触发的 action |

#### Scenario: switch 切换

- **WHEN** switch 当前值为 `false`，用户点击
- **THEN** 系统 SHALL 将值切换为 `true` 并执行 `onChange` action（如有）

### Requirement: 数据输入组件 — checkbox

`checkbox` 组件 SHALL 渲染复选框。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `boolean \| string[]` | 否 | 当前值 |
| `label` | `string` | 否 | 复选框标签 |
| `options` | `OptionItem[]` | 否 | 选项列表（多选模式） |

当提供 `options` 时 SHALL 渲染为复选框组，`value` 为选中项数组。

#### Scenario: 单个 checkbox

- **WHEN** 渲染 `{ "type": "checkbox", "label": "同意条款" }`
- **THEN** 系统 SHALL 渲染一个带 "同意条款" 标签的复选框

### Requirement: 数据输入组件 — radio

`radio` 组件 SHALL 渲染单选框组。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前选中值 |
| `options` | `OptionItem[]` | 是 | 选项列表 |

#### Scenario: radio 选择

- **WHEN** 渲染 `{ "type": "radio", "options": [{ "label": "男", "value": "male" }, { "label": "女", "value": "female" }] }`
- **THEN** 系统 SHALL 渲染单选框组，标签分别为"男"和"女"

### Requirement: 数据输入组件 — date-picker

`date-picker` 组件 SHALL 渲染日期选择器。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前值（ISO 格式） |
| `format` | `string` | 否 | 显示格式，默认 `YYYY-MM-DD` |

#### Scenario: date-picker 选择

- **WHEN** 渲染 `{ "type": "date-picker", "format": "YYYY-MM-DD" }`
- **THEN** 系统 SHALL 渲染日期选择器，选择后的值以 ISO 格式存储

### Requirement: 操作组件 — button

`button` 组件 SHALL 渲染操作按钮。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `label` | `string` | 是 | 按钮文字 |
| `action` | `ActionSchema \| ActionSchema[]` | 是 | 点击时执行的 action |
| `variant` | `string` | 否 | 样式变体：`primary`（默认）、`secondary`、`danger`、`ghost` |
| `disabled` | `string \| boolean` | 否 | 禁用条件，支持 expression |
| `loading` | `string \| boolean` | 否 | 加载状态，支持 expression |

#### Scenario: button 点击

- **WHEN** 点击 `{ "type": "button", "label": "保存", "action": { "type": "api", ... } }`
- **THEN** 系统 SHALL 执行关联的 api action

#### Scenario: button 禁用

- **WHEN** button 配置 `"disabled": "${form.title === ''}"`，表单 title 字段为空
- **THEN** 系统 SHALL 渲染禁用状态的按钮，不可点击

### Requirement: 操作组件 — link

`link` 组件 SHALL 渲染导航链接。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 链接文字 |
| `action` | `ActionSchema` | 是 | 点击时的 action（通常为 `link` 类型） |

#### Scenario: link 跳转

- **WHEN** 点击 `{ "type": "link", "text": "查看详情", "action": { "type": "link", "url": "/detail" } }`
- **THEN** 系统 SHALL 执行页面内导航到 `/detail`

### Requirement: 反馈组件 — dialog

`dialog` 组件 SHALL 渲染模态弹窗。dialog 通常不直接在 body 中使用，而是通过 `dialog` action 动态创建。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 弹窗标题 |
| `children` | `ComponentSchema[]` | 是 | 弹窗内容 |
| `width` | `number \| string` | 否 | 弹窗宽度 |

#### Scenario: dialog 渲染

- **WHEN** ActionDispatcher 创建 dialog，body 包含 form 组件
- **THEN** 系统 SHALL 渲染模态弹窗，弹窗背景显示遮罩，内容区渲染 form

### Requirement: 反馈组件 — alert

`alert` 组件 SHALL 渲染提示信息条。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 是 | 提示文字 |
| `type` | `string` | 否 | 提示类型：`info`（默认）、`success`、`warning`、`error` |

#### Scenario: alert 渲染

- **WHEN** 渲染 `{ "type": "alert", "message": "数据已保存", "type": "success" }`
- **THEN** 系统 SHALL 渲染绿色的成功提示条

### Requirement: 反馈组件 — empty

`empty` 组件 SHALL 渲染空状态占位。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | `string` | 否 | 空状态文字，默认 "暂无数据" |

#### Scenario: empty 渲染

- **WHEN** 渲染 `{ "type": "empty", "message": "还没有任务" }`
- **THEN** 系统 SHALL 渲染空状态插图和 "还没有任务" 文字
