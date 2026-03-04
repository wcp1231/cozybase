## Why

当前 Agent 修改 JSON 文件主要依赖读取整份文件后再决定如何改写。这在普通配置文件上还能工作，但在 `ui/pages.json` 这类层级深、结构异构、嵌套较多的文档上，容易占用过多上下文，也会让局部修改变得脆弱。

`pages.json` 目前还缺少面向编辑场景的稳定组件 ID 与运行时校验机制。Agent 即使只想修改一个局部节点，也需要先理解整棵页面树；而一旦写入了无效结构或不稳定引用，问题往往要到渲染阶段才暴露。需要一套面向 Agent 的结构化读写与校验能力，降低上下文成本并提高修改可靠性。

## What Changes

- 新增 `ui/pages.json` 的结构大纲读取能力，返回页面树的整体框架、层级关系和关键节点信息，帮助 Agent 在不了解 UI 结构时先建立全局视角。
- 新增 `ui/pages.json` 的节点详情读取与页面结构编辑能力，支持基于稳定 ID 读取局部节点并执行结构化修改。
- 为 `ui/pages.json` 引入稳定 page/component ID 的保持与自动补齐机制，确保页面编辑、节点定位和运行时引用都可长期稳定工作。
- 为 `ui/pages.json` 引入统一的结构校验、语义校验和引用校验能力，工具层在写入前执行严格校验，校验不通过则拒绝写入。
- 将现有 TypeScript 类型定义迁移为 Zod schema 作为单一可信源，同时导出 TypeScript 类型和运行时校验能力。
- 按组件类别引入属性分类标准化（mixin 模式），为工具层提供可预测的结构校验基础。
- 明确上述 JSON / page 工具默认作用于 Agent working copy，并与现有 `fetch_app` / `update_app_file` 工作流保持一致。

## Key Decisions

### 稳定 ID 策略

- 所有组件节点的 `id` 字段为必填，格式为 `{type}-{random}`（如 `btn-a7x3k`、`table-k8m2p`）。
- ID 完全由工具内部自动生成，工具接口不暴露 `id` 参数，AI 不可创造或指定 ID。
- AI 只能通过工具返回值获得节点 ID，后续通过该 ID 进行 update/delete/move 操作。
- 已有无 ID 的旧数据在首次工具操作时自动补齐。

### 单一可信源：Zod Schema

- 将 `packages/ui/src/schema/types.ts` 的手写 TypeScript 接口迁移为 Zod schema 定义。
- 从 Zod schema 导出三类产物：
  - `z.infer<typeof ...>` → TypeScript 类型（保持现有代码兼容）
  - `schema.parse(json)` → 运行时校验（工具层使用）
  - `zod-to-json-schema` → JSON Schema（可选，供 AI 约束参考）
- 使用 Zod 的 discriminatedUnion 以 `type` 字段作为 discriminator，匹配现有的 ComponentSchema union 结构。
- 现有 `sync-ui-guide-props.ts` 脚本调整为从 Zod schema 同步。

### 属性分类标准化（Mixin 模式）

按组件类别定义标准化属性组，用于工具层的结构校验和智能提示：

- **ContainerMixin**（`children`）：page, row, col, card, dialog
- **TextMixin**（`text`）：text, heading, tag, link
- **InteractiveMixin**（`value` + `onChange`）：input, textarea, number, select, switch, checkbox, radio, date-picker
- **DataMixin**（`api`）：table, list, form
- **ActionableMixin**（`action`）：button, link, card

工具利用分类进行智能校验，如：insert table 时自动校验 api 和 columns 必填。

### 校验层次

- **Layer 1 基础校验**：type 字段合法、ComponentBase 公共字段类型正确、children/body 元素递归合法。
- **Layer 2 结构校验**：按组件类型检查必填字段（如 table 必须有 api + columns，select 必须有 options）。
- **Layer 3 语义校验**：reload.target 引用的 ID 存在、表达式中的 scope 变量合法、custom component props 满足 required。

### 校验模式

- 工具层执行严格校验，校验不通过则拒绝写入并返回具体错误信息。
- 校验发生在工具写入前，而非渲染时。

## Capabilities

### New Capabilities
- `page-schema-editing`: 为 `ui/pages.json` 提供 UI 结构大纲读取、节点详情读取以及基于稳定 ID 的页面结构修改能力。
- `page-schema-validation`: 为 `ui/pages.json` 提供稳定 ID 自动生成、规范化、结构校验、语义校验和引用校验能力，基于 Zod schema 单一可信源。

### Modified Capabilities
- 无

## Impact

- `@cozybase/ui` 中 schema 定义从手写 TypeScript 接口迁移为 Zod schema，现有类型通过 `z.infer` 导出保持兼容。
- MCP 工具定义与注册，包括 daemon MCP server 和 SDK MCP server。
- Agent working copy 读写流程，尤其是 `ui/pages.json` 的读取、修改和同步方式。
- `@cozybase/ui` 中与 `pages.json` 相关的规范化和运行时校验能力。
- Agent 使用文档与工作流说明，特别是围绕 JSON/page 读写的最佳实践。
- 现有 `sync-ui-guide-props.ts` 需适配新的 Zod schema 来源。
- 未来与页面结构、节点引用、组件 ID 相关的工具和 UI 调试能力。
