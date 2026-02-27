## 1. 环境准备与依赖引入

- [x] 1.1 在 `packages/ui/package.json` 中添加 8 个 Radix UI 依赖：`@radix-ui/react-dialog`、`@radix-ui/react-select`、`@radix-ui/react-tabs`、`@radix-ui/react-switch`、`@radix-ui/react-checkbox`、`@radix-ui/react-radio-group`、`@radix-ui/react-alert-dialog`、`@radix-ui/react-popover`
- [x] 1.2 运行 `bun install` 验证所有 Radix 包在 React 19 + Bun 环境下正确安装
- [x] 1.3 创建 `packages/ui/src/primitives/` 目录和 `index.ts` 入口文件
- [x] 1.4 在 `packages/ui/src/index.ts` 中添加 `export * from './primitives'`

## 2. 基础 Primitive 组件实现

- [x] 2.1 实现 `primitives/switch.tsx`：`CzSwitch` 组件，封装 `@radix-ui/react-switch`，绑定 Tailwind `data-[state=*]` 样式
- [x] 2.2 实现 `primitives/checkbox.tsx`：`CzCheckbox`、`CzCheckboxIndicator` 组件，封装 `@radix-ui/react-checkbox`，自定义外观替代浏览器默认样式
- [x] 2.3 实现 `primitives/radio-group.tsx`：`CzRadioGroup`、`CzRadioGroupItem`、`CzRadioGroupIndicator` 组件，封装 `@radix-ui/react-radio-group`
- [x] 2.4 实现 `primitives/tabs.tsx`：`CzTabs`、`CzTabsList`、`CzTabsTrigger`、`CzTabsContent` 组件，封装 `@radix-ui/react-tabs`，绑定 `data-[state=active/inactive]` 样式

## 3. 复杂 Primitive 组件实现

- [x] 3.1 实现 `primitives/dialog.tsx`：`CzDialog`、`CzDialogTrigger`、`CzDialogContent`、`CzDialogTitle`、`CzDialogDescription`、`CzDialogClose` 组件，封装 `@radix-ui/react-dialog`，包含 Overlay、Portal、focus trap
- [x] 3.2 实现 `primitives/alert-dialog.tsx`：`CzAlertDialog`、`CzAlertDialogTrigger`、`CzAlertDialogContent`、`CzAlertDialogTitle`、`CzAlertDialogDescription`、`CzAlertDialogAction`、`CzAlertDialogCancel` 组件，封装 `@radix-ui/react-alert-dialog`
- [x] 3.3 实现 `primitives/select.tsx`：`CzSelect`、`CzSelectTrigger`、`CzSelectContent`、`CzSelectItem`、`CzSelectValue` 组件，封装 `@radix-ui/react-select`，Trigger 样式与 input 视觉一致
- [x] 3.4 实现 `primitives/popover.tsx`：`CzPopover`、`CzPopoverTrigger`、`CzPopoverContent`、`CzPopoverClose` 组件，封装 `@radix-ui/react-popover`
- [x] 3.5 实现 `primitives/calendar.tsx`：`CzCalendar` 纯自建日历面板组件，支持月份切换、日期选择、今日标记，周一起始

## 4. 更新 primitives/index.ts 统一导出

- [x] 4.1 在 `primitives/index.ts` 中导出所有 Primitive 组件，确保 `import { CzDialog, CzSelect, ... } from '@cozybase/ui'` 可用

## 5. Schema Adapter 层迁移 — 输入组件

- [x] 5.1 修改 `components/input.tsx` 中的 `switch` 组件：替换手写 `<div>` 为 `CzSwitch`，映射 `value` → `checked`，`onChange` → `onCheckedChange`
- [x] 5.2 修改 `components/input.tsx` 中的 `checkbox` 组件（单选和多选模式）：替换原生 `<input type="checkbox">` 为 `CzCheckbox`
- [x] 5.3 修改 `components/input.tsx` 中的 `radio` 组件：替换原生 `<input type="radio">` 为 `CzRadioGroup` + `CzRadioGroupItem`
- [x] 5.4 修改 `components/input.tsx` 中的 `select` 组件（单选模式）：替换原生 `<select>` 为 `CzSelect`，多选模式保留原生 `<select multiple>`
- [x] 5.5 修改 `components/input.tsx` 中的 `date-picker` 组件：替换原生 `<input type="date">` 为 `CzPopover` + `CzCalendar`

## 6. Schema Adapter 层迁移 — 布局与操作组件

- [x] 6.1 修改 `components/layout.tsx` 中的 `tabs` 组件：替换手写 `<div>` + `<button>` 为 `CzTabs` compound components，保持 PageContext 注册逻辑
- [x] 6.2 修改 `renderer.tsx` 中的 `DialogLayer`：替换手写弹窗渲染为 `CzDialog` 受控模式（`open={true}`，`onOpenChange(false)` → `closeDialog()`）
- [x] 6.3 修改 `components/action.tsx` 或 `renderer.tsx` 中的 `confirm` action 实现：替换 `window.confirm()` 为 `CzAlertDialog`

## 7. 验证与测试

- [x] 7.1 验证 `bun build` 能正确打包，Radix 包作为 external 或正确 bundle
- [x] 7.2 运行现有测试（`bun test src/`），确保无回归
- [ ] 7.3 使用现有 APP（如 Welcome App）手动验证 dialog 打开/关闭、focus trap、Escape 关闭正常
- [ ] 7.4 手动验证 select 键盘导航（Arrow Up/Down、Enter、Escape）
- [ ] 7.5 手动验证 tabs 键盘导航（Arrow Left/Right）和 ARIA 属性
- [ ] 7.6 手动验证 switch 键盘操作（Space 切换）和 ARIA 属性
- [ ] 7.7 手动验证 date-picker 日历面板弹出、日期选择、Escape 关闭
- [ ] 7.8 手动验证 dialog 内嵌套 select 的 z-index 层叠和定位正确
