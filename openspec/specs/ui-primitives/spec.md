# ui-primitives Specification

## Purpose
TBD - created by archiving change introduce-radix-primitives. Update Purpose after archive.
## Requirements
### Requirement: Primitive 层架构约定

`@cozybase/ui` SHALL 在 `packages/ui/src/primitives/` 目录下维护 Primitive 组件层。

每个 Primitive 组件 SHALL 满足以下约定：
- 薄封装对应的 Radix UI 原语，绑定 Tailwind + `--cz-*` token 样式
- 通过 `React.ComponentPropsWithoutRef` 继承 Radix 原语的 props 类型，支持透传
- 通过 `className` prop 允许外部覆盖样式，内部使用 `clsx()` 合并默认样式与外部 className
- 不依赖 JSON schema 类型体系（不 import `schema/types.ts`）
- 不依赖 PageContext、ExpressionResolver 或 ActionDispatcher

`packages/ui/src/primitives/index.ts` SHALL 统一导出所有 Primitive 组件。

`packages/ui/src/index.ts` SHALL 通过 `export * from './primitives'` 将 Primitive 组件纳入 `@cozybase/ui` 的公共 API。

#### Scenario: Primitive 组件独立于 JSON schema 使用

- **WHEN** Admin Shell 代码直接 `import { CzDialog } from '@cozybase/ui'`
- **THEN** CzDialog SHALL 可正常使用，不需要 SchemaRenderer 或 PageContext 环境

#### Scenario: Primitive 组件支持 className 覆盖

- **WHEN** 调用 `<CzSwitch className="my-custom-class" />`
- **THEN** CzSwitch SHALL 使用 `clsx()` 将 `my-custom-class` 与内部默认 Tailwind class 合并

### Requirement: CzDialog 弹窗 Primitive

`CzDialog` SHALL 基于 `@radix-ui/react-dialog` 实现，导出以下子组件：`CzDialog`（Root）、`CzDialogTrigger`、`CzDialogContent`、`CzDialogTitle`、`CzDialogDescription`、`CzDialogClose`。

`CzDialogContent` SHALL 提供以下默认行为：
- 通过 Radix Portal 渲染到 `document.body`，避免父级 stacking context 影响
- 包含 Overlay 遮罩层，使用 `bg-overlay` Tailwind class
- 自动 focus trap：打开时焦点锁定在弹窗内，关闭时焦点恢复到触发元素
- Escape 键关闭弹窗
- 点击 Overlay 关闭弹窗
- 设置 `aria-modal="true"` 和 `role="dialog"`

`CzDialogContent` SHALL 支持 `open` 和 `onOpenChange` props，用于受控模式（由外部状态管理打开/关闭）。

#### Scenario: CzDialog focus trap

- **WHEN** CzDialog 打开后，用户按 Tab 键
- **THEN** 焦点 SHALL 在弹窗内容区域内循环，不逃逸到背景元素

#### Scenario: CzDialog Escape 关闭

- **WHEN** CzDialog 打开后，用户按 Escape 键
- **THEN** 弹窗 SHALL 关闭，焦点恢复到触发元素

#### Scenario: CzDialog 受控模式

- **WHEN** `CzDialog` 设置 `open={true}`，并提供 `onOpenChange` 回调
- **THEN** 弹窗 SHALL 始终可见，点击 Overlay 或按 Escape 时调用 `onOpenChange(false)` 而非自行关闭

### Requirement: CzAlertDialog 确认弹窗 Primitive

`CzAlertDialog` SHALL 基于 `@radix-ui/react-alert-dialog` 实现，导出：`CzAlertDialog`（Root）、`CzAlertDialogTrigger`、`CzAlertDialogContent`、`CzAlertDialogTitle`、`CzAlertDialogDescription`、`CzAlertDialogAction`、`CzAlertDialogCancel`。

`CzAlertDialogContent` 与 `CzDialogContent` 的区别：
- 设置 `role="alertdialog"`
- 点击 Overlay 不关闭弹窗（需要用户明确选择操作）
- Escape 键触发取消操作（等同于点击 Cancel 按钮）

#### Scenario: CzAlertDialog 阻止点击外部关闭

- **WHEN** CzAlertDialog 打开后，用户点击 Overlay 遮罩
- **THEN** 弹窗 SHALL 保持打开状态，不关闭

#### Scenario: CzAlertDialog ARIA role

- **WHEN** CzAlertDialog 打开
- **THEN** 弹窗容器 SHALL 具有 `role="alertdialog"` 属性

### Requirement: CzSelect 下拉选择 Primitive

`CzSelect` SHALL 基于 `@radix-ui/react-select` 实现，导出：`CzSelect`（Root）、`CzSelectTrigger`、`CzSelectContent`、`CzSelectItem`、`CzSelectValue`。

`CzSelect` SHALL 提供以下可访问性保证：
- 键盘导航：Arrow Up/Down 切换选项，Enter/Space 选中，Escape 关闭
- 自动 ARIA 属性：`role="listbox"`、`aria-expanded`、`aria-selected`
- Trigger 按钮自动 `aria-haspopup="listbox"`

`CzSelectTrigger` SHALL 使用与当前 `<select>` 一致的输入框 Tailwind 样式（`border border-border-strong rounded-sm` 等）。

`CzSelectContent` SHALL 通过 Radix Portal 渲染，自动处理定位（向上或向下展开以适应视口）。

#### Scenario: CzSelect 键盘导航

- **WHEN** CzSelect 的下拉列表展开，用户按 Arrow Down
- **THEN** 焦点 SHALL 移动到下一个选项

#### Scenario: CzSelect 选中

- **WHEN** 用户在某个选项上按 Enter 或 Space
- **THEN** 该选项 SHALL 被选中，下拉列表关闭，触发 `onValueChange` 回调

#### Scenario: CzSelect placeholder

- **WHEN** CzSelect 未选中任何值，且设置了 `placeholder`
- **THEN** Trigger 按钮 SHALL 显示 placeholder 文本，使用 `text-text-placeholder` 样式

### Requirement: CzTabs 标签页 Primitive

`CzTabs` SHALL 基于 `@radix-ui/react-tabs` 实现，导出：`CzTabs`（Root）、`CzTabsList`、`CzTabsTrigger`、`CzTabsContent`。

`CzTabs` SHALL 提供以下可访问性保证：
- `CzTabsList` 自动 `role="tablist"`
- `CzTabsTrigger` 自动 `role="tab"`、`aria-selected`、`aria-controls`
- `CzTabsContent` 自动 `role="tabpanel"`、`aria-labelledby`
- 键盘导航：Arrow Left/Right 切换 tab（水平模式），Home/End 跳到首/末 tab

`CzTabsTrigger` 的 active/inactive 样式 SHALL 使用 Radix `data-[state=active]` / `data-[state=inactive]` variant：
- Active: `data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:font-semibold`
- Inactive: `data-[state=inactive]:border-transparent data-[state=inactive]:text-text-muted`

#### Scenario: CzTabs 键盘切换

- **WHEN** 焦点在某个 tab trigger 上，用户按 Arrow Right
- **THEN** 焦点 SHALL 移动到下一个 tab trigger，对应的 tab panel 切换显示

#### Scenario: CzTabs ARIA 属性

- **WHEN** CzTabs 渲染 3 个 tab
- **THEN** 每个 trigger SHALL 具有 `role="tab"`，每个 content SHALL 具有 `role="tabpanel"`，并通过 `aria-controls` / `aria-labelledby` 互相关联

### Requirement: CzSwitch 开关 Primitive

`CzSwitch` SHALL 基于 `@radix-ui/react-switch` 实现。

`CzSwitch` SHALL 提供以下可访问性保证：
- 自动 `role="switch"` 和 `aria-checked`
- 键盘操作：Space 键切换状态
- Focus 时显示可见的焦点环（focus ring）

样式 SHALL 使用 Radix `data-[state=*]` variant：
- 轨道：`data-[state=checked]:bg-primary data-[state=unchecked]:bg-bg-muted`
- 滑块（Thumb）：`bg-bg`，通过 `translate-x` 动画滑动

#### Scenario: CzSwitch 键盘切换

- **WHEN** CzSwitch 获得焦点，用户按 Space 键
- **THEN** switch 状态 SHALL 切换（checked ↔ unchecked），触发 `onCheckedChange` 回调

#### Scenario: CzSwitch ARIA 属性

- **WHEN** CzSwitch 当前为 checked 状态
- **THEN** 元素 SHALL 具有 `role="switch"` 和 `aria-checked="true"`

### Requirement: CzCheckbox 复选框 Primitive

`CzCheckbox` SHALL 基于 `@radix-ui/react-checkbox` 实现，导出：`CzCheckbox`、`CzCheckboxIndicator`。

`CzCheckbox` SHALL 提供以下可访问性保证：
- 自动 `role="checkbox"` 和 `aria-checked`（支持 `true`、`false`、`"indeterminate"` 三态）
- 键盘操作：Space 键切换状态
- 与 `<label>` 元素正确关联

样式 SHALL 使用自定义外观替代浏览器默认 checkbox 样式，通过 Tailwind class 实现边框、选中背景色、勾选图标。

#### Scenario: CzCheckbox 自定义外观

- **WHEN** CzCheckbox 渲染
- **THEN** SHALL 显示自定义样式的复选框（非浏览器默认），选中时显示勾选图标

#### Scenario: CzCheckbox 键盘操作

- **WHEN** CzCheckbox 获得焦点，用户按 Space 键
- **THEN** 复选框状态 SHALL 切换，触发 `onCheckedChange` 回调

### Requirement: CzRadioGroup 单选框组 Primitive

`CzRadioGroup` SHALL 基于 `@radix-ui/react-radio-group` 实现，导出：`CzRadioGroup`、`CzRadioGroupItem`、`CzRadioGroupIndicator`。

`CzRadioGroup` SHALL 提供以下可访问性保证：
- `CzRadioGroup` 自动 `role="radiogroup"`
- `CzRadioGroupItem` 自动 `role="radio"` 和 `aria-checked`
- 键盘导航：Arrow Up/Down 或 Arrow Left/Right 在选项间切换

样式 SHALL 使用自定义外观替代浏览器默认 radio 样式。

#### Scenario: CzRadioGroup 键盘导航

- **WHEN** 焦点在某个 radio item 上，用户按 Arrow Down
- **THEN** 焦点 SHALL 移动到下一个 radio item，该 item 被自动选中

#### Scenario: CzRadioGroup 单选互斥

- **WHEN** radio group 中选中一个 item
- **THEN** 之前选中的 item SHALL 自动取消选中，触发 `onValueChange` 回调

### Requirement: CzPopover 弹出层 Primitive

`CzPopover` SHALL 基于 `@radix-ui/react-popover` 实现，导出：`CzPopover`（Root）、`CzPopoverTrigger`、`CzPopoverContent`、`CzPopoverClose`。

`CzPopoverContent` SHALL 提供以下默认行为：
- 通过 Radix Portal 渲染
- 自动定位：根据视口空间自适应向上或向下展开
- 点击外部关闭
- Escape 键关闭
- Focus trap（打开时焦点移入弹出层）

`CzPopover` 主要用于 date-picker 的日历面板弹出。

#### Scenario: CzPopover 自适应定位

- **WHEN** CzPopover 在页面底部打开，下方空间不足
- **THEN** 弹出层 SHALL 自动向上展开

#### Scenario: CzPopover 点击外部关闭

- **WHEN** CzPopover 打开后，用户点击弹出层外部区域
- **THEN** 弹出层 SHALL 关闭

### Requirement: CzCalendar 日历面板 Primitive

`CzCalendar` SHALL 为纯自建组件（不基于 Radix），用于 date-picker 内部的日历显示。

`CzCalendar` SHALL 支持以下功能：
- 显示单月日历网格（7 列 × 4-6 行）
- 月份前进/后退切换
- 当前选中日期高亮（使用 `bg-primary text-white`）
- 今日日期标记
- 周一为每周起始日
- 点击日期触发 `onSelect(date: string)` 回调，date 格式为 `YYYY-MM-DD`

`CzCalendar` SHALL 使用 Tailwind class 实现所有样式，通过 `--cz-*` token 保持主题一致性。

#### Scenario: CzCalendar 月份切换

- **WHEN** 用户点击日历面板的"下一月"按钮
- **THEN** 日历 SHALL 显示下一个月的日期网格

#### Scenario: CzCalendar 日期选择

- **WHEN** 用户点击日历中的某一天（如 2025-03-15）
- **THEN** SHALL 触发 `onSelect("2025-03-15")` 回调，该日期显示为选中高亮样式

