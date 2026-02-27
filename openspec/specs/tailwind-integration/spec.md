# tailwind-integration Specification

## Purpose
TBD - created by archiving change tailwind-v4-migration. Update Purpose after archive.
## Requirements
### Requirement: Tailwind v4 构建集成

系统 SHALL 在 `packages/admin` 和 `packages/ui` 中集成 Tailwind CSS v4，使所有 UI 组件和页面可以使用 Tailwind utility class 进行样式定义。

`packages/admin` SHALL 通过 `@tailwindcss/vite` 插件集成 Tailwind v4，在 Vite 构建流程中自动编译 Tailwind CSS。

`packages/ui` SHALL 附带一个源 CSS 文件（`dist/styles/base.css`），包含 `@import "tailwindcss"` 和 `@theme` 定义。该文件 SHALL 由消费方在各自的构建流程中引入编译，而非由 `packages/ui` 预编译。

#### Scenario: Admin Vite 构建包含 Tailwind

- **WHEN** 执行 `bun run build:admin`
- **THEN** 构建产物 SHALL 包含编译后的 Tailwind CSS，所有使用的 utility class 被正确包含在 CSS 输出中

#### Scenario: Admin 开发模式支持 HMR

- **WHEN** 开发者修改 Admin 页面中的 Tailwind class
- **THEN** Vite dev server SHALL 通过 HMR 即时更新样式，无需手动刷新

#### Scenario: UI 包输出源 CSS 文件

- **WHEN** 执行 `bun run build:ui`
- **THEN** `packages/ui/dist/styles/base.css` SHALL 存在，内容为未编译的 Tailwind 源 CSS（含 `@import "tailwindcss"` 和 `@theme`）

### Requirement: @theme 与 --cz-* CSS 变量桥接

`packages/ui/src/styles/base.css` 中的 `@theme` 指令 SHALL 将所有 `--cz-*` CSS 变量映射为 Tailwind theme token。

每个 `@theme` token SHALL 通过 `var(--cz-*, fallback)` 语法引用对应的 CSS 变量，并提供硬编码 fallback 值。这确保：
- 当 `<style id="cz-theme">` 已注入时，使用 workspace 自定义的 theme 值
- 当无 theme 注入时，使用 fallback 默认值正常渲染

`@theme` SHALL 覆盖以下 Tailwind namespace：
- `--color-*`：映射所有颜色 token（primary, danger, text, bg, border, 语义色等）
- `--radius-*`：映射圆角 token
- `--shadow-*`：映射阴影 token
- `--font-family-*`：映射字体 token

#### Scenario: 有 theme 注入时使用自定义值

- **WHEN** HTML 中存在 `<style id="cz-theme">:root { --cz-primary: #7c3aed; }</style>`
- **THEN** 使用 `bg-primary` class 的元素 SHALL 渲染为 `#7c3aed` 背景色

#### Scenario: 无 theme 注入时使用 fallback

- **WHEN** HTML 中不存在 `<style id="cz-theme">`
- **THEN** 使用 `bg-primary` class 的元素 SHALL 使用 `@theme` 中定义的 fallback 值（如 `#2563EB`）渲染

#### Scenario: Dark mode 兼容

- **WHEN** workspace 配置 `theme.mode: "system"`，用户操作系统为 dark mode
- **THEN** `<style id="cz-theme">` 中的 `@media (prefers-color-scheme: dark)` 规则 SHALL 覆盖 `:root` 中的 `--cz-*` 变量，Tailwind token 自动跟随更新

### Requirement: Tailwind 依赖管理

`packages/admin` SHALL 在 `devDependencies` 中添加 `@tailwindcss/vite`。

`packages/ui` SHALL 在 `dependencies` 中添加 `tailwindcss`（作为源 CSS 的 peer 依赖声明）。

系统 SHALL 添加 `clsx` 作为 `packages/ui` 的 `dependencies`，用于组件内部 className 拼接。

#### Scenario: 依赖安装后构建成功

- **WHEN** 执行 `bun install` 后运行 `bun run build:all`
- **THEN** 所有包 SHALL 构建成功，无缺失依赖错误

