## Why

Cozybase 当前的 JSON-to-UI 渲染器已经为部分内置组件提供了零散的基础样式，但默认视觉基线仍然不完整，尤其在 `page`、`row`、`col`、`text`、`heading`、`list` 等骨架组件上，Agent 一旦没有显式生成 `style` 或 `className`，页面整体就容易退化成“能用但很丑”的裸结构。需要定义一套统一的默认样式基线，让 Agent 生成的 UI 在缺少手工样式时仍然具备基本的产品化观感，同时不污染持久化的 `pages.json`。

## What Changes

- 新增 JSON-to-UI 全部内置组件的默认视觉基线，覆盖页面留白、排版节奏、基础容器样式、表单交互组件和常见显示组件的兜底外观
- 新增统一的默认样式合并语义，明确显式 schema 属性、默认样式层和组件内部基础样式之间的优先级
- 新增基于现有 theme token 的默认样式约束，要求默认视觉优先复用 `--cz-*` 变量而不是写死颜色或字体
- 约束默认样式不回写到 `ui/pages.json`，避免将表现层默认值固化到 Agent 产出的 schema 中
- 补充 Agent/UI 指南，使 Agent 在生成 UI 时可以依赖默认视觉基线，减少重复输出样式样板代码

## Capabilities

### New Capabilities
- `ui-default-styling`: 定义 JSON-to-UI 内置组件在未显式声明样式时的默认视觉基线、覆盖优先级以及与 theme token 的集成约束

### Modified Capabilities

无

## Impact

- **UI 渲染层** (`packages/ui`): `SchemaRenderer`、内置组件实现、theme token 使用方式与默认样式合并逻辑
- **前端预览与编辑体验** (`packages/web`): Draft/Stable 预览、可视化编辑器预览都会自动获得更稳定的默认外观
- **Agent 指南** (`packages/daemon/guides/ui/*`): 需要更新对 `style` / `className` 使用顺序与默认视觉能力的说明
- **Schema / 数据兼容性**: 不新增必填 JSON 字段，不要求迁移已有 `ui/pages.json`
- **外部接口**: 无新增 HTTP/MCP API；已有 UI schema 继续兼容
