## Why

当前 `@cozybase/ui` 中的复杂交互组件（Dialog、Select、Tabs、Switch 等）使用原生 HTML 或手写 `<div>` 实现，存在严重的可访问性缺陷：Switch 无法键盘操作、Dialog 没有 focus trap 和 Escape 关闭、Tabs 缺少所有 ARIA role 和键盘导航。引入 Radix UI 无样式原语作为这些组件的交互基础，可以一次性解决可访问性、键盘导航和焦点管理问题，同时保持 Tailwind + `--cz-*` token 的样式体系不变。

## What Changes

- 在 `@cozybase/ui` 中新增 Primitive 层（`packages/ui/src/primitives/`），封装 Radix UI 原语 + Tailwind 样式，作为可独立使用的 React 组件
- 将以下 JSON-to-UI 内置组件的底层实现替换为 Primitive 组件：
  - `dialog` → 基于 `@radix-ui/react-dialog`（focus trap、Escape 关闭、aria-modal）
  - `select` → 基于 `@radix-ui/react-select`（键盘导航、自定义选项渲染）
  - `tabs` → 基于 `@radix-ui/react-tabs`（ARIA role、箭头键切换）
  - `switch` → 基于 `@radix-ui/react-switch`（键盘切换、role="switch"、aria-checked）
  - `checkbox` → 基于 `@radix-ui/react-checkbox`（自定义外观、indeterminate 状态）
  - `radio` → 基于 `@radix-ui/react-radio-group`（箭头键导航、ARIA grouping）
  - `confirm` action 的确认弹窗 → 基于 `@radix-ui/react-alert-dialog`
  - `date-picker` → 基于 `@radix-ui/react-popover` + 自建日历面板
- 不需要 Radix 的简单组件（text、heading、tag、stat、divider、alert、empty、button、link、input、textarea、number、table、list、page、row、col、card、form）保持现有实现不变
- JSON-to-UI 的 Schema Adapter 层（expression 绑定、action 派发、PageContext 注册）不受影响，仅将底层渲染出口从原生 HTML 替换为 Primitive 组件

## Capabilities

### New Capabilities

- `ui-primitives`: Primitive 组件层的规范——定义每个 Primitive 组件的 React props API、Radix 原语映射、Tailwind 样式约定和可访问性保证

### Modified Capabilities

- `ui-components`: Dialog、Select、Tabs、Switch、Checkbox、Radio、Date-picker 组件的渲染实现 SHALL 使用对应的 Primitive 组件替代原生 HTML，同时保持 JSON schema 接口不变
- `ui-renderer`: DialogLayer 的弹窗渲染和 ActionDispatcher 中 `confirm` action 的确认弹窗 SHALL 使用 Radix Dialog/AlertDialog primitive 替代当前的手写实现

## Impact

- **新增依赖**: `@radix-ui/react-dialog`、`@radix-ui/react-select`、`@radix-ui/react-tabs`、`@radix-ui/react-switch`、`@radix-ui/react-checkbox`、`@radix-ui/react-radio-group`、`@radix-ui/react-alert-dialog`、`@radix-ui/react-popover`（共 8 个 Radix 包）
- **包体积**: Radix 各包独立按需引入，tree-shakable，预计增加约 30-50KB（gzip 前）
- **代码变更**: `packages/ui/src/primitives/` 新增目录；`packages/ui/src/components/` 下的 `input.tsx`、`action.tsx`、`layout.tsx` 和 `packages/ui/src/renderer.tsx` 需修改内部实现
- **JSON schema 零变更**: `pages.json` 的 schema 定义和所有现有 APP 的 UI 配置无需修改
- **Admin Shell**: 过渡期间 Admin 手写 React 组件可直接 import Primitive 组件复用
