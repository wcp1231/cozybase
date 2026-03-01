## 1. Schema 更新

- [x] 1.1 在 `packages/ui/src/schema/types.ts` 中为 `CardComponent` 接口添加可选的 `action` 属性，类型为 `ActionSchema | ActionSchema[]`

## 2. Card 渲染器实现

- [x] 2.1 在 `packages/ui/src/components/layout.tsx` 中更新 `CardComp`：当 `action` 存在时，为外层 `div` 添加 `onClick` 处理器，调用 `dispatchAction` 执行 action
- [x] 2.2 为可点击 Card 添加交互样式：`cursor-pointer` 及 hover 时增强阴影效果；无 action 的 Card 不受影响

## 3. 事件冒泡处理

- [x] 3.1 在 `packages/ui/src/components/action.tsx` 的 `ButtonRenderer` 的 `handleClick` 中添加 `e.stopPropagation()`
- [x] 3.2 在 `packages/ui/src/components/action.tsx` 的 `LinkRenderer` 的 `handleClick` 中添加 `e.stopPropagation()`

## 4. 测试用例

- [x] 4.1 在 `packages/ui/src/components/__tests__/` 新建 `card.test.tsx`，复用 `form.test.tsx` 的 happy-dom 和 SchemaRenderer 测试模式
- [x] 4.2 测试无 action 的 Card 渲染为普通不可点击容器（无 cursor-pointer class）
- [x] 4.3 测试有 action 的 Card 点击后触发 dispatchAction（mock fetch 验证 API action 被执行）
- [x] 4.4 测试有 action 的 Card 应用 cursor-pointer 交互样式
- [x] 4.5 测试 Card 内嵌 Button 时，点击 Button 不触发 Card 的 action（验证 stopPropagation 生效）
