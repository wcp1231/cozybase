## ADDED Requirements

### Requirement: 系统为全部内置组件提供默认视觉基线

JSON-to-UI 渲染器 SHALL 为全部内置组件提供默认视觉基线。当组件 schema 未显式声明相关 root-level 样式或公开布局属性时，系统 MUST 以默认值兜底，使页面在缺少 `style` / `className` 的情况下仍具备非零留白、明确文字层级以及与组件类型匹配的基础容器或交互外观。

#### Scenario: 页面骨架组件在无显式样式时仍具备默认留白与排版层级

- **WHEN** `SchemaRenderer` 渲染仅包含 `page`、`heading`、`text`、`row`、`col` 的页面 schema
- **AND** 这些节点均未显式声明 `style`、`className` 或相关布局字段
- **THEN** 系统 SHALL 为页面应用默认的留白、间距和文字层级基线
- **AND** 至少 `page`、`row` 或 `col` 中的布局容器 SHALL 提供非零 spacing 或 padding 默认值

#### Scenario: 容器与显示组件在无显式样式时仍具备基础视觉

- **WHEN** `SchemaRenderer` 渲染 `card`、`list`、`table` 或 `empty` 等常见内置组件
- **AND** 这些组件未显式声明 root-level 样式
- **THEN** 系统 SHALL 为这些组件应用基础的 surface、边框、留白或空状态视觉兜底
- **AND** 这些默认值 SHALL 与页面骨架组件形成一致的留白和层次语义

#### Scenario: 交互与表单组件在无显式样式时仍具备可用默认外观

- **WHEN** `SchemaRenderer` 渲染 `tabs`、`form`、`input`、`textarea`、`number`、`select`、`switch`、`checkbox`、`radio`、`date-picker`、`button`、`link`、`dialog` 或 `alert`
- **AND** 这些组件未显式声明 root-level 样式
- **THEN** 系统 SHALL 为这些组件提供与其交互语义匹配的默认 root-level 视觉或布局基线
- **AND** 默认基线 MUST NOT 破坏这些组件既有的交互行为与状态表达

### Requirement: 显式 schema 样式和属性优先于默认视觉基线

系统 SHALL 将默认视觉视为兜底值，而不是强制覆盖值。对于组件 schema 中已显式声明的公开属性、`style` 和 `className`，系统 MUST 保留其意图并允许其覆盖默认视觉。

#### Scenario: 显式布局属性阻止默认值覆盖

- **WHEN** 某个 `row` 或 `col` 组件显式声明 `gap: 0`、`align: "start"` 或其他公开布局属性
- **THEN** 系统 MUST 保留这些显式值
- **AND** 系统 MUST NOT 因字段值为 falsy 而重新应用默认布局值

#### Scenario: 显式 style 和 className 覆盖默认 root-level 视觉

- **WHEN** 某个内置组件显式声明 `style` 或 `className`
- **THEN** 系统 SHALL 在保留默认视觉基线其余无冲突部分的同时，让显式声明在冲突字段上优先生效
- **AND** 组件最终外观 SHALL 以用户或 Agent 的显式样式意图为准

### Requirement: 默认视觉基线必须建立在现有 theme token 之上

系统 SHALL 使用现有 `--cz-*` theme token 表达默认视觉基线，而 MUST NOT 依赖与主题系统脱节的硬编码颜色、字体或阴影常量作为唯一来源。默认视觉 SHALL 随当前主题配置变化而生效。

#### Scenario: 主题变更后默认视觉同步变化

- **WHEN** workspace theme 配置修改了 `primaryColor`、`fontFamily` 或其他 `--cz-*` token 覆盖值
- **THEN** 未显式声明样式的内置组件默认视觉 SHALL 使用新的 token 值重新渲染
- **AND** 无需修改现有 `ui/pages.json`

### Requirement: 运行时默认样式不得回写到页面 schema

系统 MUST 将默认视觉视为运行时渲染契约，而不是持久化数据。默认样式或默认类名 MUST NOT 被自动写入 `ui/pages.json`、可视化编辑器草稿保存结果、`ui_get` 返回的节点详情，或其他面向 Agent 的 schema 输出。

#### Scenario: 未修改样式的页面保存后不产生默认样式落盘

- **WHEN** 用户或 Agent 使用未显式声明样式的页面 schema 进行预览或编辑
- **AND** 随后保存同一份逻辑内容而未新增显式样式字段
- **THEN** 持久化后的 `ui/pages.json` MUST 保持原有显式字段集合
- **AND** 系统 MUST NOT 因默认视觉基线而自动补入新的 `style` 或 `className`

#### Scenario: 节点读取结果保持显式 schema 语义

- **WHEN** Agent 对未显式声明 `style` 的内置组件调用 `ui_get`
- **THEN** 返回的节点详情 SHALL 反映原始 schema 中真实存在的字段
- **AND** 返回结果 MUST NOT 混入仅供运行时使用的默认样式字段
