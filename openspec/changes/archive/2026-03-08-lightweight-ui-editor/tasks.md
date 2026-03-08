## 1. 共享 schema 工具与映射表

- [x] 1.1 在 `packages/ui` 中提取并导出页面 schema 树遍历/定位工具，覆盖页面 `body`、数组型子槽位与单节点槽位的统一访问语义
- [x] 1.2 在 `packages/ui` 中新增组件 `type -> Zod schema` 映射与属性描述辅助逻辑，为前端属性面板提供统一元数据入口
- [x] 1.3 改造 `packages/daemon/src/modules/apps/page-editor.ts` 使用 `@cozybase/ui` 的共享树工具，保持 `ui_insert` / `ui_update` / `ui_move` / `ui_delete` 现有行为不变

## 2. Phase 1: 编辑模式 MVP

- [x] 2.1 在 `packages/web` 新增 UI 编辑器 store，管理 `draftJson`、选中节点、undo/redo 历史、dirty 状态和初始快照
- [x] 2.2 在 Draft 预览界面增加“编辑 UI”入口与编辑工具栏，接入进入/退出编辑模式、保存、撤销和重做交互
- [x] 2.3 基于 `data-schema-id` / `data-schema-type` 实现预览区点选、事件拦截和选区 overlay 定位，兼容 `display: contents` 包裹节点
- [x] 2.4 实现属性编辑面板，根据 schema 映射渲染基础表单控件与 JSON 编辑器，并把修改写回本地草稿
- [x] 2.5 复用现有 `PUT /apps/:slug/files/*` 流程实现整份 `ui/pages.json` 保存，并在检测到外部变更时显示冲突警告与处理选项

## 3. Phase 2-3: 插入、删除与排序能力

- [x] 3.1 实现分类组件面板与默认节点工厂，支持向当前页面或容器的合法位置插入新组件
- [x] 3.2 在编辑器中增加组件树视图，支持节点导航、当前选区同步和层级摘要展示
- [x] 3.3 在组件树中增加节点删除交互，确保删除会移除目标子树并同步更新当前选区、预览和属性面板
- [x] 3.4 为 `packages/web` 引入并配置 `@dnd-kit/react`（含 `@dnd-kit/react/sortable` 子路径），实现组件树内同层拖拽排序并拒绝跨容器拖拽
- [x] 3.5 将插入、删除和排序操作接入本地草稿与 undo/redo 栈，确保预览、树视图和属性面板状态保持同步

## 4. 验证与收尾

- [x] 4.1 为 `packages/ui` 的共享树工具补充测试，覆盖节点查找、非法父节点、单节点槽位遍历和同层重排时稳定 `id` 保持
- [x] 4.2 为 `page-editor` 或相关 daemon 测试补充回归用例，验证迁移到共享树工具后 `ui_*` 与 `ui_batch` 的节点定位和错误语义保持一致
- [x] 4.3 为前端编辑器补充关键交互验证，覆盖点选高亮、属性编辑、未保存状态、冲突提示、组件插入、组件删除和同层排序
- [x] 4.4 更新相关开发文档或说明，记录编辑器仅限 Draft、保存覆盖语义、复杂属性 JSON 编辑方式和当前不支持跨容器拖拽的限制
