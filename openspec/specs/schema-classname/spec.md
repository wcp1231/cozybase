# schema-classname Specification

## Purpose
TBD - created by archiving change tailwind-v4-migration. Update Purpose after archive.
## Requirements
### Requirement: 组件 className 透传

SchemaRenderer 的所有内置组件 SHALL 支持通过 `className` 属性接受外部传入的 Tailwind utility class。

组件渲染时 SHALL 使用 `clsx()` 将内部 class 与外部 `className` 合并，外部 `className` 放在最后以获得更高优先级。

组件 SHALL 同时保留 `style` 属性支持，`style` 用于无法用 Tailwind class 表达的动态值。

#### Scenario: App 开发者通过 className 定制 card 样式

- **WHEN** JSON schema 定义 `{ "type": "card", "className": "shadow-lg rounded-xl", "children": [...] }`
- **THEN** 渲染的 card 元素 SHALL 包含 card 默认 class 以及 `shadow-lg rounded-xl`

#### Scenario: className 优先级高于组件默认样式

- **WHEN** card 组件内部使用 `rounded-md`，但 schema 传入 `"className": "rounded-xl"`
- **THEN** 渲染结果中 SHALL 同时存在两个 class，由 CSS specificity 决定最终效果（后出现的 class 在相同 specificity 下胜出）

#### Scenario: className 与 style 并存

- **WHEN** schema 定义 `{ "type": "text", "className": "text-lg font-bold", "style": { "lineHeight": "2" } }`
- **THEN** 元素 SHALL 同时应用 Tailwind class 和 inline style

#### Scenario: 未传 className 时使用默认样式

- **WHEN** schema 未包含 `className` 属性
- **THEN** 组件 SHALL 仅使用内部定义的默认 Tailwind class 渲染

### Requirement: className 在 JSON schema 类型中声明

`ComponentBase` 类型中 SHALL 包含可选的 `className?: string` 字段（当前已存在）。

所有继承 `ComponentBase` 的组件类型 SHALL 自动获得 `className` 支持，无需逐个添加。

#### Scenario: schema 类型校验

- **WHEN** App 开发者在 pages.json 中为任意组件添加 `"className": "flex gap-4"`
- **THEN** TypeScript 类型检查 SHALL 通过，不报错

