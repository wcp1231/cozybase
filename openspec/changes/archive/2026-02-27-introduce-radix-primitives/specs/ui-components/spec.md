## MODIFIED Requirements

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
