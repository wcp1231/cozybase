## Why

当前 JSON-to-UI 组件体系中，`card` 组件支持丰富内容（`children`）但不可点击，`button` 组件可点击但只支持纯文本 `label`。用户无法通过现有组件实现"内容丰富的可点击元素"，最常见的场景就是可点击的卡片（如点击跳转详情页、点击触发 dialog 等）。

## What Changes

- `CardComponent` schema 新增可选 `action` 属性，类型为 `ActionSchema | ActionSchema[]`
- `CardComp` 渲染器：当存在 `action` 时，整张卡片可点击，添加 `cursor-pointer` 和 hover 视觉反馈
- `ButtonRenderer` 的 `onClick` 添加 `e.stopPropagation()`，防止 card 内嵌 button 时事件冒泡触发 card 的 action

## Capabilities

### New Capabilities

- `card-clickable-action`: Card 组件支持可选的 `action` 属性，使卡片整体可点击并触发 action

### Modified Capabilities

（无现有 spec 需要修改）

## Impact

- **Schema 层**: `packages/ui/src/schema/types.ts` — `CardComponent` interface 新增 `action` 字段
- **渲染层**: `packages/ui/src/components/layout.tsx` — `CardComp` 添加点击处理和交互样式
- **事件冒泡**: `packages/ui/src/components/action.tsx` — `ButtonRenderer` 添加 `stopPropagation`
- **文档**: `packages/daemon/guides/ui/components/` — 可能需要更新 card 组件文档
- **向后兼容**: 完全向后兼容，`action` 为可选字段，不影响现有 card 使用
