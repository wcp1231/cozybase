## Why

Cozybase 目前完全依赖 AI Agent 来生成和修改 UI schema（`pages.json`），用户无法直接对页面元素进行微调。当 Agent 生成的 UI 不完全符合预期时，用户只能通过重新描述需求来让 Agent 修改，效率低且不够直观。需要提供一个轻量级的可视化编辑器，让用户可以直接在预览页面上点选元素、编辑属性、添加组件和调整顺序，作为 AI Agent 的补充而非替代。

## What Changes

- 新增**前端 UI 编辑器模式**：在 Draft 模式下提供"编辑 UI"入口，激活后进入可视化编辑状态
- 新增**组件选择交互**：点击预览中的任意元素高亮选中，基于已有的 `data-schema-id` / `data-schema-type` DOM 属性实现
- 新增**属性编辑面板**：选中组件后在右侧显示可编辑的属性表单，支持文本、数值、枚举、布尔值、JSON 等编辑器
- 新增**组件插入功能**：从分类组件面板中选择组件插入到页面指定位置
- 新增**组件删除功能**：允许用户从组件树中删除目标节点及其子树
- 新增**拖拽排序**：在组件树中拖拽调整同层组件的顺序
- 新增**撤销/重做**：前端维护编辑历史栈，支持 undo/redo
- 新增**批量提交**：所有编辑在前端本地完成，通过整体写回 `pages.json` 文件提交到后端
- 新增**共享树遍历工具**：将 `page-editor.ts` 中的纯函数树遍历逻辑提取到 `@cozybase/ui` 包，前后端共用
- 新增**Schema 映射表**：提供组件 type → Zod schema 的查找表，用于属性面板的表单生成

## Capabilities

### New Capabilities
- `visual-ui-editor`: 前端可视化 UI 编辑器的核心能力，包括编辑模式切换、组件选择、属性编辑、组件插入、组件删除、拖拽排序、撤销/重做、批量提交
- `ui-schema-tree-utils`: 共享的 UI schema 树遍历工具函数（findNodeById、visitChildComponents 等），从 daemon 的 page-editor 提取到 `@cozybase/ui` 包

### Modified Capabilities
- `page-schema-editing`: page-editor.ts 将改为从 `@cozybase/ui` 导入树遍历函数，不再自行实现（纯重构，行为不变）

## Impact

- **前端代码** (`packages/web`): 新增编辑器相关的 Zustand store、features/editor 目录下的多个组件
- **UI 包** (`packages/ui`): 新增 `schema/tree-utils.ts` 和 `schema/schema-map.ts`，扩展 `index.ts` 导出
- **Daemon 包** (`packages/daemon`): `page-editor.ts` 重构导入来源（可选，不影响行为）
- **新增依赖**: `@dnd-kit/react`（Phase 3，使用 `@dnd-kit/react/sortable` 子路径实现组件树排序，添加到 `packages/web`）
- **不涉及后端 API 变更**: 复用已有的 `PUT /apps/:slug/files/*` 端点进行文件写回
