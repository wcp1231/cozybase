## Context

Cozybase 的 UI 层基于声明式 JSON schema (`pages.json`)，包含 28 种内置组件类型，通过 `SchemaRenderer` 递归渲染为 React 组件。每个渲染的组件被包裹在 `<div data-schema-id={id} data-schema-type={type} style={{ display: 'contents' }}>` 中，这为可视化选择提供了天然的锚点。

当前编辑链路：Agent → MCP tools → PageEditor (daemon) → pages.json → SchemaRenderer。用户无法直接参与这个链路。

关键约束：
- 仅在 Draft 模式下可用（Stable 模式只读）
- 前端本地编辑，不需要新增后端 API（复用 `PUT /apps/:slug/files/*`）
- 轻量级定位：辅助 Agent，不是替代

## Goals / Non-Goals

**Goals:**
- 用户可以在预览中点击选中任意组件，查看和编辑其属性
- 用户可以从分类面板中添加新组件到指定位置
- 用户可以删除不需要的组件节点
- 用户可以通过组件树拖拽调整同层组件顺序
- 支持 undo/redo，所有编辑可撤销
- 一键保存，整体写回 `pages.json`
- 提取树遍历工具到 `@cozybase/ui`，前后端共用

**Non-Goals:**
- 不做跨容器拖拽（仅支持同层排序）
- 不做自由画布布局（组件仍遵循 schema 定义的流式布局）
- 不做实时协同编辑（Agent 和用户同时编辑时采用覆盖策略 + 警告提示）
- 不做 Action/API 的可视化配置器（复杂属性以 JSON 编辑器呈现）
- 不做组件的样式可视化编辑器（className/style 以文本输入呈现）

## Decisions

### D1: 前端本地编辑 + 整体写回

**选择**: 前端维护 `pages.json` 的内存副本（`draftJson`），所有编辑在本地完成，保存时整体 PUT 写回。

**替代方案**:
- A) 新增 REST API 逐操作提交 — 需要后端改动，增加网络往返，难以实现 undo
- B) 复用 MCP WebSocket 通道 — 增加协议复杂度，与 Agent 通道耦合

**理由**: 无需后端改动，undo/redo 天然支持（基于内存快照栈），已有 `PUT /apps/:slug/files/*` 端点可直接使用。PagesJson 是纯 JSON 数据，`structuredClone()` 性能足够。

### D2: 基于 `data-schema-id` 的组件选择

**选择**: 利用 `SchemaRenderer` 已有的 `data-schema-id` / `data-schema-type` DOM 属性，通过 capture-phase 事件监听实现点选。

**实现要点**:
- 在 `#cz-app-content` 上注册 capture-phase 的 `click`/`pointerdown`/`submit` 监听
- `event.target.closest('[data-schema-id]')` 获取目标组件 ID
- `preventDefault()` + `stopPropagation()` 阻止按钮/链接/表单的原有行为
- 选中高亮通过绝对定位的 overlay `<div>` 实现

**关键约束**: 组件包裹 `<div>` 使用 `display:contents`，`getBoundingClientRect()` 返回零尺寸。需查询 `[data-schema-id="X"] > *:first-child` 获取实际元素位置。

### D3: Zustand 状态管理 + structuredClone undo 栈

**选择**: 新建 `useEditorStore` (Zustand)，undo/redo 基于 `structuredClone()` 的全量快照栈。

**替代方案**:
- Immer patches — 更细粒度，但实现复杂，且需要额外依赖
- Command pattern — 需为每种操作定义逆操作，维护成本高

**理由**: PagesJson 通常不大（< 100KB），`structuredClone` 原生实现足够快。栈上限 50 条，内存可控。Zustand 与项目已有的 `chat-store.ts` 保持一致。

### D4: Zod schema 内省生成属性面板

**选择**: 建立 `componentSchemaMap` (type → ZodObject)，通过 `.shape` 遍历字段生成属性描述符，再渲染对应的表单控件。

**属性分组**:
1. Identity (readonly): `type`, `id`
2. Content: `text`, `label`, `message`, `title`, `placeholder`, `value`
3. Layout: `className`, `style`, `justify`, `align`, `gap`, `wrap`, `padding`
4. Behavior: `visible`, `disabled`, `loading`, `variant`
5. Data (JSON editor): `api`, `columns`, `options`, `fields`, `action`, `onChange`

**理由**: 各 `*ComponentSchema` 导出为独立的 `z.object()` 调用，`.shape` 可直接访问。无需解析 union 或 lazy 类型。复杂属性（action 数组、columns 配置）以 JSON textarea 呈现，避免过度工程化。

### D5: 组件树作为删除与排序主入口

**选择**: 在左侧面板的组件树视图中承载节点导航、删除与拖拽排序；删除操作通过树节点上的显式 action 触发，排序使用 `@dnd-kit/react` 与 `@dnd-kit/react/sortable`。

**替代方案**:
- A) 直接在画布 overlay 上提供删除按钮 — 易与业务交互重叠，且 overlay 定位复杂
- B) 仅通过属性面板提供删除按钮 — 对层级结构的上下文感知弱

**理由**: 组件树天然展示父子关系，用户更容易确认删除目标及其影响范围。把删除和排序放在同一结构化视图中，也能减少画布层面的额外交互负担。

### D6: 组件树拖拽排序（非画布内拖拽）

**选择**: 在左侧面板的组件树视图中实现拖拽排序，使用 `@dnd-kit/react` 提供的 `DragDropProvider` 与 `@dnd-kit/react/sortable` 的 `useSortable`。

**替代方案**: 画布内直接拖拽 — 因 `display:contents` 导致拖拽目标定位困难，且现有 SchemaRenderer 非编辑优化

**理由**: 树视图拖拽更可靠、更直观，避免了 `display:contents` 的布局问题。同时组件树也作为辅助导航和选择机制。

### D7: Agent 并发编辑冲突处理

**选择**: 乐观覆盖 + 警告提示。

**实现**: 进入编辑模式时快照 `originalJson`。如果 AppContext 刷新后 `pagesJson` 与 `originalJson` 不同，显示警告横幅："Agent 在您编辑期间修改了 UI，保存将覆盖这些更改"。用户可选择：保存覆盖 / 放弃编辑重新加载 / 继续编辑。

**理由**: 合并策略在 JSON 树上实现复杂度高，与轻量级定位不符。实际使用中用户和 Agent 同时编辑的场景较少。

### D8: 渐进式实现分 3 个 Phase

**Phase 1 (MVP)**: 选择 + 属性编辑 + 工具栏 + 保存提交
**Phase 2**: 组件插入（组件面板 + 默认值）
**Phase 3**: 组件树 + 删除 + 拖拽排序（引入 `@dnd-kit`）

**理由**: Phase 1 提供核心价值（微调属性），后续 Phase 增量添加能力，每个 Phase 可独立交付。

## Risks / Trade-offs

- **`display:contents` 定位问题** → 查询包裹 div 的第一个子元素获取位置；使用 `ResizeObserver` + scroll 事件保持 overlay 位置同步
- **Agent 并发编辑冲突** → 警告提示 + 用户选择策略；不做自动合并
- **大型 PagesJson 的 undo 性能** → `structuredClone` 原生实现足够快；栈上限 50 条；必要时可改用增量 patch
- **Zod schema 内省的边界情况** → 仅对独立导出的 `z.object()` 类型做内省，不处理 union/lazy；未知字段类型降级为 JSON 编辑器
- **编辑模式下事件拦截可能遗漏** → capture-phase 拦截 click/pointerdown/submit 三类事件；如有遗漏可增量补充
