## Context

`@cozybase/ui` 当前有 32 个内置组件，均使用原生 HTML + Tailwind class 实现。其中约 8 个复杂交互组件（Dialog、Select、Tabs、Switch、Checkbox、Radio、Date-picker、Confirm）存在可访问性缺陷（无键盘导航、缺少 ARIA 属性、无 focus trap）。

组件代码分为两层：
1. **Schema Adapter 层**（`components/action.tsx`、`input.tsx`、`layout.tsx`）——负责 expression 解析、action 派发、PageContext 注册
2. **渲染出口**——当前直接输出原生 HTML 元素

本次变更在两层之间插入 **Primitive 层**，封装 Radix UI 原语 + Tailwind 样式。Schema Adapter 不变，仅替换底层渲染目标。

约束条件：
- 样式体系保持 Tailwind v4 + `--cz-*` CSS 变量 token，不引入 shadcn/ui 的变量命名
- `pages.json` JSON schema 不可变更，确保现有 APP 零迁移
- Admin Shell 过渡期间需要直接使用 Primitive 组件（Admin 未来将迁移为 JSON-to-UI App）

## Goals / Non-Goals

**Goals:**

- 修复 8 个交互组件的可访问性缺陷（键盘导航、ARIA 属性、focus 管理）
- 建立 Primitive 层，提供可独立使用的高质量 React 组件（不依赖 JSON schema 体系）
- Primitive 组件可同时被 JSON-to-UI Schema Adapter 和 Admin Shell 直接消费
- 保持 JSON schema 接口完全向后兼容

**Non-Goals:**

- 不引入 shadcn/ui 完整体系（不用其 CSS 变量命名、不用其 CLI 工具）
- 不改造简单组件（text、heading、tag、stat、divider、alert、empty、button、link、input、textarea、number、table、list、page、row、col、card、form）——保持原生 HTML 实现
- 不变更 `--cz-*` CSS 变量命名
- 不在本次变更中处理 Admin Shell 迁移为 JSON-to-UI App
- 不新增 JSON schema 组件类型

## Decisions

### Decision 1: Primitive 层的目录结构

**方案**: 在 `packages/ui/src/primitives/` 下按组件维度组织，每个组件一个文件，统一从 `primitives/index.ts` 导出。

```
packages/ui/src/primitives/
├── index.ts              # 统一导出
├── dialog.tsx            # CzDialog, CzDialogTrigger, CzDialogContent, ...
├── alert-dialog.tsx      # CzAlertDialog, CzAlertDialogAction, ...
├── select.tsx            # CzSelect, CzSelectItem, ...
├── tabs.tsx              # CzTabs, CzTabsList, CzTabsTrigger, CzTabsContent
├── switch.tsx            # CzSwitch
├── checkbox.tsx          # CzCheckbox
├── radio-group.tsx       # CzRadioGroup, CzRadioGroupItem
├── popover.tsx           # CzPopover, CzPopoverTrigger, CzPopoverContent
└── calendar.tsx          # CzCalendar (date-picker 用，纯自建)
```

**拒绝的替代方案**: 把 Radix 直接内联到 Schema Adapter 中。理由：Primitive 层需要独立于 JSON schema 存在，以便 Admin Shell 直接消费，也便于未来独立测试。

### Decision 2: Primitive 组件的 API 设计原则

**方案**: Primitive 组件 **薄封装** Radix 原语，职责仅为：
1. 绑定 Tailwind + `--cz-*` token 样式
2. 设定合理的默认行为（如 Dialog 默认 modal、Select 默认 portal）
3. 透传 Radix 原语的 props（通过 `React.ComponentPropsWithoutRef` 继承）

```tsx
// 示例：CzSwitch 的 API
interface CzSwitchProps extends React.ComponentPropsWithoutRef<typeof RadixSwitch.Root> {
  className?: string;
}

function CzSwitch({ className, ...props }: CzSwitchProps) {
  return (
    <RadixSwitch.Root
      className={clsx(
        'w-10 h-[22px] rounded-full transition-colors',
        'data-[state=checked]:bg-primary data-[state=unchecked]:bg-bg-muted',
        className
      )}
      {...props}
    >
      <RadixSwitch.Thumb className="block w-[18px] h-[18px] rounded-full bg-bg transition-transform data-[state=checked]:translate-x-[20px]" />
    </RadixSwitch.Root>
  );
}
```

**拒绝的替代方案**: 设计全新的 props API 屏蔽 Radix 细节。理由：过度封装增加维护成本，且 Admin Shell 直接使用时需要 Radix 原生的灵活性。

### Decision 3: Schema Adapter 与 Primitive 的集成方式

**方案**: Schema Adapter 内部 import Primitive 组件，将 schema props 映射为 Primitive props。Adapter 继续负责 expression 解析和 action 派发。

```
Schema JSON → Schema Adapter (expression/action/context) → Primitive (Radix/Tailwind) → DOM
```

以 `select` 为例：
- `SelectAdapter`（`components/input.tsx` 中）从 schema 解析 `options`、`value`、`onChange`
- 将解析后的值传给 `<CzSelect>` Primitive
- `CzSelect` 内部使用 Radix Select 渲染带键盘导航和 ARIA 的下拉框

### Decision 4: Dialog/AlertDialog 与现有 DialogLayer 的整合

**方案**: 保持 `PageContext` 的 dialog stack 机制不变。`DialogLayer`（`renderer.tsx`）改用 `CzDialog` 渲染每一层弹窗，`confirm` action 改用 `CzAlertDialog`。

当前流程：
1. `ActionDispatcher` 调用 `ctx.openDialog(entry)` → PageContext 压栈
2. `DialogLayer` 遍历 dialog stack → 每个 entry 渲染为一个弹窗

变更后，步骤 2 中的渲染改为使用 `CzDialog`（Radix Portal + focus trap），其余逻辑不变。

Radix Dialog 的 `open` prop 绑定为 `true`（因为可见性由 PageContext stack 控制，不需要 Radix 管理 open/close 状态），`onOpenChange(false)` 映射到 `ctx.closeDialog()`。

### Decision 5: Tailwind v4 中 Radix `data-[state=*]` 样式

**方案**: 使用 Tailwind v4 原生的 `data-*` variant，无需额外配置。

```tsx
// Tailwind v4 原生支持 data attribute variants
className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-bg-muted"
className="data-[state=active]:border-primary data-[state=inactive]:border-transparent"
className="data-[state=open]:animate-in data-[state=closed]:animate-out"
```

Tailwind v4 的 `data-*` variant 开箱即用地匹配 Radix 的 `data-state`、`data-disabled`、`data-orientation` 等属性，不需要引入 `tailwindcss-radix` 插件。

### Decision 6: 公共 API 导出策略

**方案**: `@cozybase/ui` 的 public export 新增 primitives 入口：

```ts
// packages/ui/src/index.ts
export { SchemaRenderer } from './renderer';
export type { SchemaRendererProps } from './renderer';
export type * from './schema/types';
export * from './theme';

// 新增
export * from './primitives';
```

Admin Shell 通过 `import { CzDialog, CzSelect } from '@cozybase/ui'` 直接使用。

### Decision 7: Date-picker 的实现策略

**方案**: 使用 Radix Popover 作为弹出层容器，内部自建简单日历面板组件（`CzCalendar`），不引入第三方日期库。

理由：
- 当前 date-picker 只需要单日期选择（`YYYY-MM-DD`），不需要 date range、时间选择等复杂功能
- 引入 react-day-picker 等库会增加额外依赖
- 日历面板核心逻辑（月份切换、日期网格、选中状态）约 100-150 行代码，复杂度可控

如果未来需要 date range 等高级功能，可以再考虑引入专业日期库。

## Risks / Trade-offs

**[Risk] Radix 包版本与 React 19 兼容性** → Radix UI 从 v1.1+ 开始支持 React 19。引入前需验证所有 8 个包在 React 19 + Bun 环境下的兼容性，建议先创建一个最小 PoC。

**[Risk] Bun bundler 对 Radix ESM 的处理** → 当前 `@cozybase/ui` 使用 `bun build` 打包，Radix 包作为 external 还是 bundle 进去需要验证。建议将 `@radix-ui/*` 标记为 external（与 react 一致），由最终消费方的 bundler 处理。

**[Risk] Select Portal 定位问题** → Radix Select 默认使用 Portal 渲染下拉列表。在 Dialog 内嵌套 Select 时，需要确认 z-index 层叠和定位是否正确。Radix 内部处理了这种场景，但仍需实际测试。

**[Risk] Date-picker 自建日历的维护成本** → 自建日历面板需要处理月份切换、起始星期、本地化等细节。当前 scope 限定为最简实现（单日期、固定周一起始），避免过度工程。

**[Trade-off] Primitive 薄封装 vs 厚封装** → 选择薄封装意味着 Admin Shell 使用者需要了解 Radix 的 compound component 模式（如 `<CzDialog><CzDialogTrigger>...</CzDialogTrigger><CzDialogContent>...</CzDialogContent></CzDialog>`）。这增加了使用复杂度，但换来了灵活性和更低的维护成本。考虑到 Admin Shell 未来会迁移为 JSON-to-UI App（不再直接使用 Primitive），这个 trade-off 是合理的。
