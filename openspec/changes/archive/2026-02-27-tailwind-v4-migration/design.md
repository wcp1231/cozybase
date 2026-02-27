## Context

cozybase 是一个通过 JSON schema 驱动 UI 渲染的低代码平台。当前所有 UI 样式（~20 个 SchemaRenderer 组件 + 3 个 Admin 页面）完全使用 inline React `style={{}}` 实现，刚引入了 CSS Variables（`var(--cz-*)`）作为 theme token。

当前构建体系：
- `packages/ui`：`bun build` 输出纯 JS（无 CSS）
- `packages/admin`：Vite + React plugin，无 CSS 框架
- 运行时通过 `<style id="cz-theme">` 注入 theme CSS 变量到 HTML

关键发现：`ComponentBase` 中已定义 `className?: string`，部分组件已透传该属性。

## Goals / Non-Goals

**Goals:**
- 在 admin（Vite）和 ui 包中集成 Tailwind v4
- 将已有 `--cz-*` token 通过 `@theme` 桥接到 Tailwind
- 将所有组件和 Admin 页面的 inline style 替换为 Tailwind utility class
- App 开发者可在 JSON schema 中通过 `className` 使用 Tailwind class

**Non-Goals:**
- 不引入 DaisyUI 或其他组件库（避免与现有 JSON schema 组件体系冲突）
- 不支持运行时动态编译 Tailwind class（只支持构建时）
- 不做 CSS-in-JS 方案（styled-components、emotion 等）
- 不改变 theme 配置存储方式（继续使用 `workspace.yaml`）

## Decisions

### D1: UI 包的 CSS 输出策略 — 源文件模式

**选择**：`packages/ui` 附带一个**源 CSS 文件**（含 `@import "tailwindcss"` + `@theme`），消费方在自己的构建中引入编译。

**备选方案**：
- A. 输出预编译 CSS → 无法适配消费方的自定义 token，且 Tailwind class 需要 purge 分析消费方模板
- C. UI 包改用 Vite → 构建工具变更过大，且 UI 包作为 library 不适合 Vite app 模式

**具体做法**：
```
packages/ui/
├── src/
│   └── styles/
│       └── base.css          # @import "tailwindcss" + @theme 映射
├── dist/
│   ├── index.js              # React 组件（bun build，不变）
│   └── styles/
│       └── base.css          # 原样复制，消费方引入
└── package.json              # exports 增加 "./styles"
```

```css
/* packages/ui/src/styles/base.css */
@import "tailwindcss";

@theme {
  --color-primary: var(--cz-primary, #2563EB);
  --color-primary-light: var(--cz-primary-light, #93C5FD);
  --color-danger: var(--cz-danger, #DC2626);
  --color-secondary: var(--cz-secondary, #6B7280);

  --color-text: var(--cz-text, #111827);
  --color-text-secondary: var(--cz-text-secondary, #374151);
  --color-text-muted: var(--cz-text-muted, #6B7280);
  --color-text-placeholder: var(--cz-text-placeholder, #9CA3AF);

  --color-bg: var(--cz-bg, #ffffff);
  --color-bg-subtle: var(--cz-bg-subtle, #f9fafb);
  --color-bg-muted: var(--cz-bg-muted, #f3f4f6);

  --color-border: var(--cz-border, #e5e7eb);
  --color-border-strong: var(--cz-border-strong, #d1d5db);

  /* 语义色 */
  --color-success-bg: var(--cz-success-bg);
  --color-success-text: var(--cz-success-text);
  --color-error-bg: var(--cz-error-bg);
  --color-error-text: var(--cz-error-text);
  --color-warning-bg: var(--cz-warning-bg);
  --color-warning-text: var(--cz-warning-text);
  --color-info-bg: var(--cz-info-bg);
  --color-info-text: var(--cz-info-text);

  /* 覆盖 Tailwind 默认值 */
  --radius-sm: var(--cz-radius-sm, 4px);
  --radius-md: var(--cz-radius-md, 8px);
  --radius-full: var(--cz-radius-full, 9999px);

  --shadow-sm: var(--cz-shadow-sm);
  --shadow-md: var(--cz-shadow-md);

  --font-family-sans: var(--cz-font-family, system-ui, sans-serif);
}
```

每个 `@theme` token 引用 `var(--cz-*)` 并提供 fallback。这样：
- 有 theme CSS 注入时 → 使用 workspace 自定义值
- 无 theme CSS 注入时 → 使用 fallback 默认值

### D2: Admin 包集成 — Tailwind v4 Vite Plugin

**选择**：使用 `@tailwindcss/vite` 插件，零配置集成。

```typescript
// packages/admin/vite.config.ts
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ...
});
```

```css
/* packages/admin/src/index.css */
@import "@cozybase/ui/styles/base.css";

/* Admin 专属扩展（如有需要） */
```

```tsx
// packages/admin/src/main.tsx
import './index.css';
```

### D3: 运行时 CSS 分发 — 双层注入

**选择**：保留现有 `<style id="cz-theme">` 注入机制（theme 变量），Tailwind 编译产物作为静态资源随 HTML 一起分发。

```
Admin SPA:
  Vite build → dist/assets/index-xxx.css（含 Tailwind 编译产物）
  + Server 注入 <style id="cz-theme">（theme 变量覆盖）

App UI:
  App 构建 → 含 Tailwind CSS（如果 App 使用 Tailwind）
  + Server 注入 <style id="cz-theme">（theme 变量覆盖）
```

**关键**：`--cz-*` CSS 变量仍然是 theme 自定义的唯一入口。`@theme` 中的 `var(--cz-*, fallback)` 确保两层可独立工作。

`generateThemeCSS()` 保持不变——它只生成 `:root { --cz-*: value }` 变量声明，Tailwind `@theme` 负责消费这些变量。

### D4: className 合并策略 — clsx

**选择**：使用 `clsx` 进行 className 拼接，不使用 `tailwind-merge`。

**理由**：
- `clsx` 0.5KB，只做字符串拼接，足够用
- `tailwind-merge` 3KB+，它智能合并冲突 class（如 `p-4 p-2` → `p-2`），但增加运行时开销
- 当前场景下组件内部 class 和用户 `className` 冲突概率低，不值得引入 merge 逻辑

```tsx
import { clsx } from 'clsx';

function ButtonRenderer({ schema }: SchemaComponentProps) {
  const s = schema as ButtonComponent;
  return (
    <button className={clsx(
      'px-4 py-2 text-sm font-medium rounded-sm inline-flex items-center gap-1.5 transition-opacity',
      variantClasses[s.variant ?? 'primary'],
      s.disabled && 'opacity-60 cursor-not-allowed',
      s.className,  // 用户自定义 class 放在最后，优先级最高
    )}>
      {s.label}
    </button>
  );
}
```

### D5: 组件样式迁移策略 — 纯 className，移除 inline style

**选择**：组件内部完全用 Tailwind class，不保留 inline style。`s.style` prop 仍然支持但作为最后手段。

**迁移模式**：

```tsx
// BEFORE（当前实现）
<div style={{
  border: '1px solid var(--cz-border)',
  borderRadius: 8,
  boxShadow: 'var(--cz-shadow-sm)',
  backgroundColor: 'var(--cz-bg)',
  padding: 16,
  ...s.style,
}}>

// AFTER（Tailwind 实现）
<div
  className={clsx('border border-border rounded-md shadow-sm bg-bg p-4', s.className)}
  style={s.style}
>
```

**条件样式用 clsx**：
```tsx
// Tab 选中状态
<button className={clsx(
  'px-4 py-2 text-sm border-b-2 bg-transparent transition-colors',
  isActive
    ? 'border-primary text-primary font-semibold'
    : 'border-transparent text-text-muted font-normal',
)}>
```

**动态值保留 inline style**（仅限无法用 class 表达的场景）：
```tsx
// Row 组件的 gap 值由 schema 指定，class 只能覆盖预设档位
<div
  className={clsx('flex flex-row', s.className)}
  style={{ gap: s.gap ?? 8, justifyContent: s.justify, alignItems: s.align, ...s.style }}
>
```

### D6: UI 包构建流程 — bun build + 文件复制

**选择**：保留 `bun build` 输出 JS，新增 `cp` 步骤复制 CSS 源文件。

```json
{
  "scripts": {
    "build": "bun build src/index.ts --outdir dist --format esm --splitting && cp -r src/styles dist/styles"
  },
  "exports": {
    ".": "./dist/index.js",
    "./styles/base.css": "./dist/styles/base.css"
  }
}
```

不引入额外构建工具。CSS 是源文件直接复制，由消费方（admin、app）各自用 Tailwind 编译。

## Risks / Trade-offs

**[全量重写风险]** → 所有组件和页面的 style 一次性替换为 className
- 缓解：按组件逐个迁移，每迁移完一个组件后构建验证
- 缓解：Admin 和 UI 组件可并行迁移

**[App 开发者学习成本]** → 使用 Tailwind class 需要了解 Tailwind 语法
- 缓解：className 是可选的，不使用时组件有完整的默认样式
- 缓解：Tailwind IntelliSense 在 IDE 中提供自动补全

**[Tailwind v4 生态成熟度]** → v4 于 2025 年初发布，部分社区插件尚未适配
- 缓解：cozybase 不依赖社区插件，只用核心 utility classes
- 缓解：v4 的 Vite plugin 已稳定

**[CSS 体积增长]** → Tailwind 编译产物会增加 CSS 大小
- 缓解：Tailwind v4 自动 tree-shake 未使用的 class
- 预估：Admin SPA 增加 ~10-20KB gzip CSS

**[动态值限制]** → Tailwind class 不支持完全任意的动态值
- 缓解：schema 中 `style` prop 仍然可用
- 缓解：Row/Col 等布局组件的 `gap`、`justify` 等属性继续通过 style 设置
