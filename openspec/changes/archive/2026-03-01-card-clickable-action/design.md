## Context

当前 JSON-to-UI 组件体系中，组件按职责分为四类：Layout（page, row, col, card, tabs, divider）、Display（text, heading, tag, stat, table, list）、Input（form 及各类表单控件）、Action（button, link, dialog, alert, empty）。

`card` 作为 Layout 组件，支持 `title` 和 `children`，可以嵌套任意子组件展示丰富内容，但纯粹是一个视觉容器，不支持交互。`button` 作为 Action 组件，支持 `action` 属性触发各种操作，但只能显示一个 `label` 字符串。

这导致一个常见需求无法满足：可点击的卡片（如点击整张卡片跳转到详情页、触发 dialog 等）。

## Goals / Non-Goals

**Goals:**
- Card 组件支持可选的 `action` 属性，使整张卡片可点击
- 可点击的 Card 提供视觉反馈（cursor:pointer、hover 效果）
- Card 内嵌 Button 时，Button 点击不会冒泡触发 Card 的 action
- 完全向后兼容，不影响现有无 action 的 Card

**Non-Goals:**
- 不引入通用的 `clickable` 包装组件（留待未来需要时再做）
- 不在 `ComponentBase` 上添加 action（避免过度设计）
- 不为 Card 添加 `disabled` / `loading` 状态（Card 不是按钮，不需要这些语义）

## Decisions

### Decision 1: 在 Card 上添加可选 action vs 新建 clickable 组件

**选择**: 直接在 `CardComponent` 上添加可选的 `action` 属性。

**原因**:
- 可点击卡片是目前唯一的场景需求，不需要通用方案
- 避免额外 JSON 嵌套层级，使用更简洁
- 改动范围最小：只需修改 schema type 和 CardComp 渲染器
- 后续如需通用 clickable，可独立加入，不冲突

### Decision 2: 事件冒泡处理方式

**选择**: 在 `ButtonRenderer` 和 `LinkRenderer` 的 onClick 中添加 `e.stopPropagation()`。

**原因**:
- Card 内嵌 Button 是常见场景，button 点击应触发 button 自身的 action
- `stopPropagation` 是标准的 DOM 事件处理方式
- 只需要在 Action 类组件（button、link）中添加，不影响其他组件

### Decision 3: 可点击 Card 的 hover 样式

**选择**: 当 Card 有 `action` 时，添加 `cursor-pointer` 和 hover 时的阴影/边框增强效果。

**原因**:
- 用户需要视觉反馈来感知卡片可点击
- hover 变化应该微妙不突兀：增强 `shadow` 或轻微变化 `border-color`
- 只在有 action 的 Card 上生效，无 action 的 Card 完全不受影响

## Risks / Trade-offs

- **[风险] Card 内所有点击都会冒泡到 Card** → 通过在 Button、Link 等 Action 组件中 `stopPropagation` 缓解；对于 Card 内的其他可交互元素（如 form 控件），其事件类型不同（change、input），不会触发 Card 的 click handler
- **[权衡] 只解决 Card 可点击，不解决通用容器可点击** → 当前需求明确只有 Card 场景，YAGNI 原则，后续可按需扩展
