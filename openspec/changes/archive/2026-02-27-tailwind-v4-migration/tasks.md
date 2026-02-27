## 1. 基础设施搭建

- [x] 1.1 安装依赖：`packages/ui` 添加 `tailwindcss`、`clsx`；`packages/admin` 添加 `@tailwindcss/vite`
- [x] 1.2 创建 `packages/ui/src/styles/base.css`，包含 `@import "tailwindcss"` + 完整 `@theme` 映射（所有 `--cz-*` token 带 fallback）
- [x] 1.3 修改 `packages/ui/package.json`：build 脚本添加 `cp -r src/styles dist/styles`；exports 添加 `"./styles/base.css"` 入口
- [x] 1.4 修改 `packages/admin/vite.config.ts`：添加 `@tailwindcss/vite` 插件
- [x] 1.5 创建 `packages/admin/src/index.css`，引入 `@import "@cozybase/ui/styles/base.css"`
- [x] 1.6 修改 `packages/admin/src/main.tsx`：添加 `import './index.css'`
- [x] 1.7 验证：执行 `bun run build:all`，确认 UI 包输出 `dist/styles/base.css`，Admin 包含编译后的 Tailwind CSS

## 2. UI 组件迁移 — 布局组件

- [x] 2.1 迁移 `packages/ui/src/components/layout.tsx` — page 组件：inline style → Tailwind class + `clsx()`
- [x] 2.2 迁移 `packages/ui/src/components/layout.tsx` — row 组件：基础 flex class，动态 gap/justify/align 保留 style
- [x] 2.3 迁移 `packages/ui/src/components/layout.tsx` — col 组件：同 row 模式
- [x] 2.4 迁移 `packages/ui/src/components/layout.tsx` — card 组件：边框、圆角、阴影、bg、padding 全部用 class
- [x] 2.5 迁移 `packages/ui/src/components/layout.tsx` — tabs 组件：tab bar + active/inactive 状态用 clsx 条件 class
- [x] 2.6 迁移 `packages/ui/src/components/layout.tsx` — divider 组件：分隔线用 border class

## 3. UI 组件迁移 — 数据展示组件

- [x] 3.1 迁移 `packages/ui/src/components/display.tsx` — text/heading 组件
- [x] 3.2 迁移 `packages/ui/src/components/display.tsx` — tag 组件：TAG_COLORS 改为 class 映射表
- [x] 3.3 迁移 `packages/ui/src/components/display.tsx` — stat 组件
- [x] 3.4 迁移 `packages/ui/src/components/display.tsx` — table 组件：表头、行、分页器、loading/error/empty 状态
- [x] 3.5 迁移 `packages/ui/src/components/display.tsx` — list 组件

## 4. UI 组件迁移 — 操作与反馈组件

- [x] 4.1 迁移 `packages/ui/src/components/action.tsx` — button 组件：variantStyles 改为 class 映射表，disabled 用 clsx 条件
- [x] 4.2 迁移 `packages/ui/src/components/action.tsx` — link 组件
- [x] 4.3 迁移 `packages/ui/src/components/action.tsx` — dialog 组件：遮罩层 + 弹窗容器 + 标题 + 关闭按钮
- [x] 4.4 迁移 `packages/ui/src/components/action.tsx` — alert 组件：alertTypeStyles 改为 class 映射表
- [x] 4.5 迁移 `packages/ui/src/components/action.tsx` — empty 组件

## 5. UI 组件迁移 — 数据输入组件

- [x] 5.1 迁移 `packages/ui/src/components/input.tsx` — 共享样式：`labelStyle`、`baseInputStyle`、`errorStyle` 改为 Tailwind class 常量
- [x] 5.2 迁移 `packages/ui/src/components/input.tsx` — form 组件：布局 + submit button
- [x] 5.3 迁移 `packages/ui/src/components/input.tsx` — input/textarea/number/date-picker（独立模式）
- [x] 5.4 迁移 `packages/ui/src/components/input.tsx` — select 组件（form 内 + 独立模式）
- [x] 5.5 迁移 `packages/ui/src/components/input.tsx` — switch 组件（form 内 + 独立模式）
- [x] 5.6 迁移 `packages/ui/src/components/input.tsx` — checkbox/radio 组件

## 6. Renderer 迁移

- [x] 6.1 迁移 `packages/ui/src/renderer.tsx` — DialogLayer 遮罩和弹窗容器
- [x] 6.2 迁移 `packages/ui/src/renderer.tsx` — 未知组件错误占位符
- [x] 6.3 迁移 `packages/ui/src/renderer.tsx` — ErrorBoundary fallback UI

## 7. Admin 页面迁移

- [x] 7.1 迁移 `packages/admin/src/pages/app-list.tsx`：页面背景、卡片列表、badge、loading/error 状态
- [x] 7.2 迁移 `packages/admin/src/pages/app-layout.tsx`：顶栏、侧边栏、NavLink active/inactive
- [x] 7.3 迁移 `packages/admin/src/pages/app-page-view.tsx`：error/empty 提示

## 8. 清理与验证

- [x] 8.1 删除 `packages/ui/src/theme/generate-css.ts` 中与 Tailwind 重复的样式逻辑（保留 `:root` CSS 变量生成）
- [x] 8.2 确认所有组件文件中不存在硬编码颜色值（`#xxx`、`rgb()`、`rgba()`）
- [x] 8.3 执行 `bun run build:all` 确认构建通过
- [x] 8.4 启动 `bun run dev`，访问 Admin 页面验证视觉效果
- [x] 8.5 验证 dark mode：设置 `workspace.yaml` 中 `theme.mode: dark`，确认 Admin 和 App UI 正常切换
