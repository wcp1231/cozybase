# UI Components

## Purpose

Define the built-in UI component set, including layout, data display, data input, and interaction components, plus their schema fields and expected runtime behavior.
## Requirements
### Requirement: 布局组件 — page

`page` 组件 SHALL 使用 Tailwind utility class 实现样式，替代 inline style。

`page` 组件 SHALL 使用 `clsx()` 合并内部 class 与 `s.className`。布局相关的 `gap` 等动态属性（由 schema 指定）MAY 保留 inline style。

#### Scenario: page 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "page", "children": [...] }`
- **THEN** page 容器元素 SHALL 使用 `className`（如 `w-full flex flex-col gap-4`）而非 inline `style` 进行样式定义

### Requirement: 布局组件 — row

`row` 组件 SHALL 使用 Tailwind utility class 实现基础 flex 布局样式。

`justify`、`align`、`gap` 等由 schema 动态指定的属性 SHALL 通过 inline style 设置（因为值不可枚举）。

#### Scenario: row 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "row", "gap": 12, "children": [...] }`
- **THEN** row 元素 SHALL 使用 `className="flex flex-row"` 加 `style={{ gap: 12 }}`

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

`card` 组件 SHALL 使用 Tailwind utility class 实现边框、圆角、阴影、背景、内边距样式。

#### Scenario: card 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "card", "title": "信息", "children": [...] }`
- **THEN** card 容器 SHALL 使用 Tailwind class（如 `border border-border rounded-md shadow-sm bg-bg p-4`）渲染

### Requirement: 布局组件 — tabs

`tabs` 组件 SHALL 使用 `CzTabs` Primitive 组件替代当前的手写 `<div>` + `<button>` 实现。

Schema Adapter 层 SHALL 将 `tabs` schema 的 `items` 映射为 `CzTabsTrigger` 和 `CzTabsContent` 子组件。`value` 属性映射为 `CzTabs` 的 `defaultValue` 或 `value`（受控模式）。

当 `tabs` 组件有 `id` 时，SHALL 继续向 PageContext 注册当前选中 tab 的 value。`onValueChange` 回调中 SHALL 更新 PageContext 中的组件状态。

JSON schema 接口不变。

#### Scenario: tabs 使用 CzTabs Primitive 渲染

- **WHEN** 渲染 `{ "type": "tabs", "items": [...] }`
- **THEN** 系统 SHALL 使用 `CzTabs`、`CzTabsList`、`CzTabsTrigger`、`CzTabsContent` 渲染，tab 容器自动具有 `role="tablist"`，每个 tab 具有 `role="tab"`

#### Scenario: tabs 键盘导航

- **WHEN** 焦点在某个 tab 上，用户按 Arrow Right
- **THEN** 焦点 SHALL 移动到下一个 tab，对应的 tab panel 切换显示

#### Scenario: tabs active 状态使用 Tailwind class

- **WHEN** 某个 tab 被选中
- **THEN** 该 tab 按钮 SHALL 通过 Radix `data-[state=active]` variant 应用 active class（如 `border-primary text-primary font-semibold`），非选中 tab 应用 `data-[state=inactive]` class

### Requirement: 布局组件 — divider

`divider` 组件 SHALL 使用 Tailwind utility class 实现分隔线样式。

#### Scenario: divider 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "divider" }`
- **THEN** 分隔线元素 SHALL 使用 Tailwind class（如 `border-t border-border`）渲染

### Requirement: 数据展示组件 — table

`table` 组件 SHALL 使用 Tailwind utility class 实现表头、行、单元格、分页器、loading/error 状态样式。

#### Scenario: table 表头使用 Tailwind class

- **WHEN** 渲染 table 的表头
- **THEN** `<th>` 元素 SHALL 使用 Tailwind class（如 `bg-bg-subtle text-text-secondary text-left px-3 py-2 text-xs font-medium`）渲染

### Requirement: 数据展示组件 — list

`list` 组件 SHALL 使用 Tailwind utility class 实现列表容器和空状态样式。

#### Scenario: list 空状态使用 Tailwind class

- **WHEN** list API 返回 0 条数据
- **THEN** 空状态提示 SHALL 使用 Tailwind class（如 `text-center p-6 text-text-muted`）渲染

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

`tag` 组件 SHALL 使用 Tailwind utility class 实现标签样式，color 变体通过 class 映射表实现。

#### Scenario: tag color 变体

- **WHEN** 渲染 `{ "type": "tag", "text": "进行中", "color": "info" }`
- **THEN** tag 元素 SHALL 使用 info 语义色的 Tailwind class（如 `bg-info-bg text-info-text`）渲染

### Requirement: 数据展示组件 — stat

`stat` 组件 SHALL 使用 Tailwind utility class 实现统计卡样式。

#### Scenario: stat 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "stat", "label": "总数", "value": "42" }`
- **THEN** stat 容器 SHALL 使用 Tailwind class（如 `bg-bg border border-border rounded-md p-4`）渲染

### Requirement: 数据输入组件 — 通用输入样式

所有输入组件（input、textarea、number、select、date-picker）SHALL 使用 Tailwind utility class 定义基础输入框样式，替代当前的 `baseInputStyle` 对象。

对于使用 Primitive 组件的 select 和 date-picker，其 trigger 按钮 SHALL 与其他输入组件保持一致的视觉样式（边框、圆角、内边距、字号）。

form 组件的 label、error message、submit button SHALL 使用 Tailwind class 定义样式。

#### Scenario: input 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "input", "placeholder": "请输入..." }`
- **THEN** input 元素 SHALL 使用 Tailwind class（如 `block w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-sm outline-none`）渲染

#### Scenario: switch 使用 CzSwitch Primitive 渲染

- **WHEN** 渲染 switch 组件，当前值为 true
- **THEN** switch SHALL 通过 `CzSwitch` 渲染，轨道使用 `data-[state=checked]:bg-primary`，滑块使用 `bg-bg`

#### Scenario: select trigger 与 input 视觉一致

- **WHEN** 渲染 select 组件
- **THEN** `CzSelectTrigger` SHALL 使用与 input 一致的边框、圆角、内边距 Tailwind class

### Requirement: 移除所有 inline style 颜色值

迁移完成后，`packages/ui/src/components/` 中的所有组件文件 SHALL 不包含任何硬编码颜色值（如 `#fff`、`#2563EB`、`rgb()`）。

所有颜色 SHALL 通过 Tailwind utility class 引用 `@theme` 中定义的 token。

#### Scenario: 组件文件无硬编码颜色

- **WHEN** 检查 `layout.tsx`、`action.tsx`、`display.tsx`、`input.tsx` 的源代码
- **THEN** SHALL 不存在任何 `#xxx`、`rgb()`、`rgba()` 格式的硬编码颜色值（CSS 标准关键词如 `transparent`、`inherit` 除外）

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

`select` 组件 SHALL 使用 `CzSelect` Primitive 组件替代当前的原生 `<select>` HTML 元素。

Schema Adapter 层 SHALL 将 `select` schema 的 `options` 映射为 `CzSelectItem` 子组件，`value` 映射为 `CzSelect` 的 `value`，`placeholder` 映射为 `CzSelectValue` 的 `placeholder`。

`onChange` action SHALL 在 `CzSelect` 的 `onValueChange` 回调中触发。

`select` 在 form 内时 SHALL 继续与 FormContext 集成。

JSON schema 接口不变。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string \| string[]` | 否 | 当前选中值 |
| `options` | `OptionItem[]` | 是 | 选项列表 |
| `multiple` | `boolean` | 否 | 是否多选，默认 `false` |
| `placeholder` | `string` | 否 | 占位文字 |
| `onChange` | `ActionSchema` | 否 | 值变化时触发的 action |

`OptionItem` SHALL 包含 `{ "label": string, "value": string }`。

注意：`multiple` 多选模式暂时保留原生 `<select multiple>` 实现，因为 Radix Select 不支持多选。后续可通过 Radix Popover + Checkbox List 实现多选。

#### Scenario: select 单选使用 CzSelect 渲染

- **WHEN** 渲染 `{ "type": "select", "options": [{ "label": "高", "value": "high" }, { "label": "低", "value": "low" }] }`
- **THEN** 系统 SHALL 使用 `CzSelect` 渲染自定义下拉框，支持键盘导航（Arrow Up/Down 切换、Enter 选中、Escape 关闭）

#### Scenario: select multiple 保持原生实现

- **WHEN** 渲染 `{ "type": "select", "multiple": true, "options": [...] }`
- **THEN** 系统 SHALL 继续使用原生 `<select multiple>` 渲染

### Requirement: 数据输入组件 — switch

`switch` 组件 SHALL 使用 `CzSwitch` Primitive 组件替代当前的手写 `<div>` 实现。

Schema Adapter 层 SHALL 将 `switch` schema 的 `value` 映射为 `CzSwitch` 的 `checked`，`onChange` action SHALL 在 `onCheckedChange` 回调中触发。

`switch` 在 form 内时 SHALL 继续与 FormContext 集成。

JSON schema 接口不变。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `boolean` | 否 | 当前值 |
| `onChange` | `ActionSchema` | 否 | 值变化时触发的 action |

#### Scenario: switch 键盘切换

- **WHEN** switch 获得焦点，用户按 Space 键
- **THEN** switch 状态 SHALL 切换（checked ↔ unchecked），触发 `onChange` action（如有）

#### Scenario: switch 切换

- **WHEN** switch 当前值为 `false`，用户点击
- **THEN** 系统 SHALL 将值切换为 `true` 并执行 `onChange` action（如有）

#### Scenario: switch ARIA 属性

- **WHEN** switch 渲染
- **THEN** 元素 SHALL 具有 `role="switch"` 和正确的 `aria-checked` 值

### Requirement: 数据输入组件 — checkbox

`checkbox` 组件 SHALL 使用 `CzCheckbox` Primitive 组件替代当前的原生 `<input type="checkbox">`。

Schema Adapter 层 SHALL：
- 单个 checkbox：将 `value` 映射为 `CzCheckbox` 的 `checked`
- 多选模式（有 `options`）：为每个 option 渲染一个 `CzCheckbox`，维护选中值数组

`checkbox` 在 form 内时 SHALL 继续与 FormContext 集成。

JSON schema 接口不变。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `boolean \| string[]` | 否 | 当前值 |
| `label` | `string` | 否 | 复选框标签 |
| `options` | `OptionItem[]` | 否 | 选项列表（多选模式） |

当提供 `options` 时 SHALL 渲染为复选框组，`value` 为选中项数组。

#### Scenario: 单个 checkbox 使用 CzCheckbox 渲染

- **WHEN** 渲染 `{ "type": "checkbox", "label": "同意条款" }`
- **THEN** 系统 SHALL 使用 `CzCheckbox` 渲染自定义外观复选框，带 "同意条款" 标签，具有 `role="checkbox"` 和 `aria-checked` 属性

#### Scenario: checkbox 键盘操作

- **WHEN** checkbox 获得焦点，用户按 Space 键
- **THEN** 复选框状态 SHALL 切换

### Requirement: 数据输入组件 — radio

`radio` 组件 SHALL 使用 `CzRadioGroup` Primitive 组件替代当前的原生 `<input type="radio">`。

Schema Adapter 层 SHALL 将 `radio` schema 的 `options` 映射为 `CzRadioGroupItem` 子组件，`value` 映射为 `CzRadioGroup` 的 `value`。

`radio` 在 form 内时 SHALL 继续与 FormContext 集成。

JSON schema 接口不变。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前选中值 |
| `options` | `OptionItem[]` | 是 | 选项列表 |

#### Scenario: radio 使用 CzRadioGroup 渲染

- **WHEN** 渲染 `{ "type": "radio", "options": [{ "label": "男", "value": "male" }, { "label": "女", "value": "female" }] }`
- **THEN** 系统 SHALL 使用 `CzRadioGroup` + `CzRadioGroupItem` 渲染自定义外观单选框组，具有 `role="radiogroup"` 和 `role="radio"` 属性

#### Scenario: radio 键盘导航

- **WHEN** 焦点在某个 radio item 上，用户按 Arrow Down
- **THEN** 焦点 SHALL 移动到下一个选项，该选项自动选中

### Requirement: 数据输入组件 — date-picker

`date-picker` 组件 SHALL 使用 `CzPopover` + `CzCalendar` Primitive 组件替代当前的原生 `<input type="date">`。

Schema Adapter 层 SHALL：
- 渲染一个 `CzPopoverTrigger`（显示当前选中日期或 placeholder 的输入框样式按钮）
- `CzPopoverContent` 内渲染 `CzCalendar` 日历面板
- 日历选中日期后关闭 Popover 并更新值

`date-picker` 在 form 内时 SHALL 继续与 FormContext 集成。

JSON schema 接口不变。

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `value` | `string` | 否 | 当前值（ISO 格式） |
| `format` | `string` | 否 | 显示格式，默认 `YYYY-MM-DD` |

#### Scenario: date-picker 显示日历面板

- **WHEN** 用户点击 date-picker 的触发按钮
- **THEN** SHALL 弹出日历面板（通过 CzPopover），显示当前月份的日期网格

#### Scenario: date-picker 选择日期

- **WHEN** 用户在日历面板中点击某一天
- **THEN** 该日期 SHALL 被选中，Popover 关闭，输入框显示选中的日期，值以 ISO 格式存储

#### Scenario: date-picker Escape 关闭

- **WHEN** 日历面板打开后，用户按 Escape
- **THEN** 日历面板 SHALL 关闭，不改变当前值

### Requirement: 操作组件 — button

`button` 组件 SHALL 使用 Tailwind utility class 实现所有 variant 样式。variant 样式 SHALL 定义为 class 字符串映射表。

#### Scenario: button variant 使用 Tailwind class

- **WHEN** 渲染 `{ "type": "button", "label": "保存", "variant": "primary" }`
- **THEN** button 元素 SHALL 使用 primary variant 对应的 Tailwind class（如 `bg-primary text-white`）

#### Scenario: button disabled 状态

- **WHEN** button 的 `disabled` 条件为 true
- **THEN** button 元素 SHALL 通过 `clsx()` 条件应用 `opacity-60 cursor-not-allowed` class

### Requirement: 操作组件 — link

`link` 组件 SHALL 使用 Tailwind utility class 实现链接样式。

#### Scenario: link 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "link", "text": "详情" }`
- **THEN** link 元素 SHALL 使用 Tailwind class（如 `text-primary hover:underline cursor-pointer`）渲染

### Requirement: 反馈组件 — dialog

`dialog` 组件 SHALL 使用 `CzDialog` Primitive 组件替代当前的手写 `<div>` 固定定位遮罩实现。

Schema Adapter 层的 `dialog` action 触发逻辑不变（通过 PageContext dialog stack）。`DialogLayer` 中每个 dialog entry 的渲染 SHALL 改用 `CzDialogContent`。

`CzDialog` SHALL 以受控模式使用：`open` 绑定为 `true`（由 PageContext stack 控制可见性），`onOpenChange(false)` 映射到 `PageContext.closeDialog()`。

JSON schema 接口不变。

#### Scenario: dialog 使用 CzDialog Primitive 渲染

- **WHEN** 打开一个 dialog
- **THEN** 弹窗 SHALL 通过 `CzDialogContent` 渲染，自动具有 focus trap、Escape 关闭、`aria-modal="true"` 和 `role="dialog"`

#### Scenario: dialog 嵌套

- **WHEN** 在 dialog A 内触发打开 dialog B
- **THEN** dialog B SHALL 正确渲染在 dialog A 之上，各自维护独立的 focus trap

### Requirement: 反馈组件 — alert

`alert` 组件 SHALL 使用 Tailwind utility class 实现四种 type（info/success/warning/error）的样式。type 样式 SHALL 定义为 class 字符串映射表。

#### Scenario: alert type 使用语义色

- **WHEN** 渲染 `{ "type": "alert", "message": "成功", "type": "success" }`
- **THEN** alert 元素 SHALL 使用 success 语义色对应的 Tailwind class（如 `bg-success-bg text-success-text border-success-border`）

### Requirement: 反馈组件 — empty

`empty` 组件 SHALL 使用 Tailwind utility class 实现空状态样式。

#### Scenario: empty 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "empty", "message": "暂无数据" }`
- **THEN** empty 容器 SHALL 使用 Tailwind class（如 `text-center py-8 text-text-placeholder`）渲染

