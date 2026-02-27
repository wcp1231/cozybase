## MODIFIED Requirements

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

### Requirement: 布局组件 — card

`card` 组件 SHALL 使用 Tailwind utility class 实现边框、圆角、阴影、背景、内边距样式。

#### Scenario: card 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "card", "title": "信息", "children": [...] }`
- **THEN** card 容器 SHALL 使用 Tailwind class（如 `border border-border rounded-md shadow-sm bg-bg p-4`）渲染

### Requirement: 布局组件 — tabs

`tabs` 组件 SHALL 使用 Tailwind utility class 实现标签栏样式，包括 active/inactive 状态切换。

#### Scenario: tabs active 状态使用 Tailwind class

- **WHEN** 某个 tab 被选中
- **THEN** 该 tab 按钮 SHALL 通过 `clsx()` 条件应用 active class（如 `border-primary text-primary font-semibold`），非选中 tab 应用 inactive class

### Requirement: 布局组件 — divider

`divider` 组件 SHALL 使用 Tailwind utility class 实现分隔线样式。

#### Scenario: divider 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "divider" }`
- **THEN** 分隔线元素 SHALL 使用 Tailwind class（如 `border-t border-border`）渲染

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

`dialog` 组件 SHALL 使用 Tailwind utility class 实现遮罩层、弹窗容器、标题、关闭按钮样式。

#### Scenario: dialog 使用 Tailwind class 渲染

- **WHEN** 打开一个 dialog
- **THEN** 遮罩层 SHALL 使用 `fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]` 等 Tailwind class 渲染

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

### Requirement: 数据展示组件 — table

`table` 组件 SHALL 使用 Tailwind utility class 实现表头、行、单元格、分页器、loading/error 状态样式。

#### Scenario: table 表头使用 Tailwind class

- **WHEN** 渲染 table 的表头
- **THEN** `<th>` 元素 SHALL 使用 Tailwind class（如 `bg-bg-subtle text-text-secondary text-left px-3 py-2 text-xs font-medium`）渲染

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

### Requirement: 数据展示组件 — list

`list` 组件 SHALL 使用 Tailwind utility class 实现列表容器和空状态样式。

#### Scenario: list 空状态使用 Tailwind class

- **WHEN** list API 返回 0 条数据
- **THEN** 空状态提示 SHALL 使用 Tailwind class（如 `text-center p-6 text-text-muted`）渲染

### Requirement: 数据输入组件 — 通用输入样式

所有输入组件（input、textarea、number、select、date-picker）SHALL 使用 Tailwind utility class 定义基础输入框样式，替代当前的 `baseInputStyle` 对象。

form 组件的 label、error message、submit button SHALL 使用 Tailwind class 定义样式。

#### Scenario: input 使用 Tailwind class 渲染

- **WHEN** 渲染 `{ "type": "input", "placeholder": "请输入..." }`
- **THEN** input 元素 SHALL 使用 Tailwind class（如 `block w-full px-2.5 py-1.5 text-sm border border-border-strong rounded-sm outline-none`）渲染

#### Scenario: switch 使用 Tailwind class 渲染

- **WHEN** 渲染 switch 组件，当前值为 true
- **THEN** switch 轨道 SHALL 使用 Tailwind class（如 `bg-primary`），滑块 SHALL 使用 `bg-bg` 的 Tailwind class 渲染

### Requirement: 移除所有 inline style 颜色值

迁移完成后，`packages/ui/src/components/` 中的所有组件文件 SHALL 不包含任何硬编码颜色值（如 `#fff`、`#2563EB`、`rgb()`）。

所有颜色 SHALL 通过 Tailwind utility class 引用 `@theme` 中定义的 token。

#### Scenario: 组件文件无硬编码颜色

- **WHEN** 检查 `layout.tsx`、`action.tsx`、`display.tsx`、`input.tsx` 的源代码
- **THEN** SHALL 不存在任何 `#xxx`、`rgb()`、`rgba()` 格式的硬编码颜色值（CSS 标准关键词如 `transparent`、`inherit` 除外）
