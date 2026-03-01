## ADDED Requirements

### Requirement: Card 组件支持可选 action

`CardComponent` schema SHALL 支持可选的 `action` 属性，类型为 `ActionSchema | ActionSchema[]`。当 `action` 存在时，整张卡片可点击并触发对应的 action。

```typescript
export interface CardComponent extends ComponentBase {
  type: 'card';
  title?: string;
  children: ComponentSchema[];
  padding?: number;
  action?: ActionSchema | ActionSchema[];
}
```

#### Scenario: 无 action 的 Card 保持现有行为
- **WHEN** Card 没有 `action` 属性
- **THEN** Card SHALL 渲染为普通的不可点击容器，与当前行为完全一致

#### Scenario: 有 action 的 Card 整体可点击
- **WHEN** Card 定义了 `action` 属性（如 `{ "type": "link", "url": "/detail/1" }`）
- **AND** 用户点击卡片区域
- **THEN** Card SHALL 触发 `dispatchAction` 执行该 action

#### Scenario: 有 action 的 Card 支持 action 数组
- **WHEN** Card 的 `action` 属性为数组（如 `[{ "type": "api", ... }, { "type": "reload", ... }]`）
- **AND** 用户点击卡片区域
- **THEN** Card SHALL 按顺序执行数组中的所有 action

### Requirement: 可点击 Card 的视觉反馈

当 Card 定义了 `action` 时，Card SHALL 提供视觉反馈表明其可点击状态。

#### Scenario: 可点击 Card 显示 pointer 光标
- **WHEN** Card 定义了 `action` 属性
- **THEN** Card SHALL 渲染时应用 `cursor: pointer` 样式

#### Scenario: 可点击 Card 的 hover 效果
- **WHEN** Card 定义了 `action` 属性
- **AND** 用户鼠标悬浮在 Card 上
- **THEN** Card SHALL 显示增强的阴影效果，提供视觉悬浮反馈

#### Scenario: 无 action 的 Card 无交互样式
- **WHEN** Card 没有 `action` 属性
- **THEN** Card SHALL 不显示 `cursor: pointer` 或 hover 增强效果

### Requirement: Card 内嵌 Action 组件的事件冒泡处理

当可点击 Card 内部包含 Button 或 Link 等 Action 组件时，Action 组件的点击事件 SHALL 不冒泡触发 Card 的 action。

#### Scenario: Card 内 Button 点击不触发 Card action
- **WHEN** 可点击 Card 内部嵌套了一个 Button 组件
- **AND** 用户点击该 Button
- **THEN** Button 的 action SHALL 被触发
- **AND** Card 的 action SHALL 不被触发

#### Scenario: Card 内 Link 点击不触发 Card action
- **WHEN** 可点击 Card 内部嵌套了一个 Link 组件
- **AND** 用户点击该 Link
- **THEN** Link 的 action SHALL 被触发
- **AND** Card 的 action SHALL 不被触发

#### Scenario: Card 内非 Action 区域点击触发 Card action
- **WHEN** 可点击 Card 内部有 Text、Tag 等非 Action 组件
- **AND** 用户点击这些非 Action 区域
- **THEN** Card 的 action SHALL 被触发
