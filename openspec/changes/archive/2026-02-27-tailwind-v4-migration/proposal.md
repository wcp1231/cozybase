## Why

当前 cozybase 所有 UI 样式（`packages/ui` 组件 + `packages/admin` 页面）完全依赖 inline React `style={{}}` 加上刚引入的 CSS Variables（`var(--cz-*)`）。随着 Admin UI 即将新增设置页、Agent 对话、数据可视化等复杂页面，且未来需要让 App 开发者在 JSON schema 中拥有更灵活的样式控制能力，inline style 方案已无法满足需求——不支持伪类（hover/focus）、不支持响应式（media query）、不支持动画、且大量散落的 style 对象对 AI Agent 维护极不友好。

## What Changes

- **引入 Tailwind CSS v4**：在 `packages/admin`（Vite）和 `packages/ui` 中集成 Tailwind v4，使用 `@theme` 指令桥接已有 `--cz-*` CSS 变量 token 体系
- **重写 Admin 页面样式**：将 `packages/admin/src/pages/` 中 3 个页面的所有 inline style 替换为 Tailwind utility class。**BREAKING**：移除所有 inline style
- **重写 UI 组件样式**：将 `packages/ui/src/components/` 中约 20 个 SchemaRenderer 组件的 inline style 替换为 Tailwind class。**BREAKING**：移除所有 inline style
- **重写 renderer 样式**：将 `packages/ui/src/renderer.tsx` 中的 inline style 替换为 Tailwind class
- **JSON schema 支持 className**：在 `SchemaRenderer` 所有组件上增加 `className` prop 支持，允许 App 开发者在 `pages.json` 中通过 Tailwind class 定制样式
- **清理旧 theme 生成逻辑**：`generateThemeCSS()` 简化为只生成 `:root` CSS 变量，不再承担完整样式职责；Tailwind `@theme` 承接样式系统
- **构建配置调整**：`packages/ui` 构建流程需要输出 Tailwind CSS，`packages/admin` Vite 配置集成 Tailwind v4 插件

## Capabilities

### New Capabilities
- `tailwind-integration`: Tailwind v4 构建集成——在 admin（Vite）和 ui 包中配置 Tailwind v4，通过 `@theme` 映射 `--cz-*` token，输出可用 CSS
- `schema-classname`: JSON schema className 支持——`SchemaRenderer` 所有组件接受 `className` 属性，App 开发者可在 `pages.json` 中使用 Tailwind utility class 定制样式

### Modified Capabilities
- `ui-components`: 所有 UI 组件的样式实现从 inline style 切换为 Tailwind class，外部接口不变但内部实现全部重写
- `ui-renderer`: SchemaRenderer 和 DialogLayer 的样式实现从 inline style 切换为 Tailwind class

## Impact

- **依赖新增**：`tailwindcss` v4（`packages/admin`、`packages/ui`）、可能需要 `clsx` 或 `tailwind-merge` 用于 className 合并
- **构建变更**：`packages/ui` 需要输出 CSS 文件（当前只输出 JS）；`packages/admin` Vite 需配置 Tailwind v4 插件
- **运行时 CSS 注入**：App UI 的 HTML 除了注入 theme CSS 变量外，还需加载 Tailwind CSS（组件样式）
- **受影响文件**：`packages/ui/src/components/`（4 个文件）、`packages/ui/src/renderer.tsx`、`packages/admin/src/pages/`（3 个文件）、构建配置文件、`packages/ui/src/theme/` 相关文件
- **Schema 类型变更**：`packages/ui/src/schema/types.ts` 中所有组件类型需增加可选 `className` 字段
- **无数据迁移**：纯前端样式改动，不涉及任何数据结构或 API 行为变化
