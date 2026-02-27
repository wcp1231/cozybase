## 1. Admin 三栏壳层改造

- [x] 1.1 在 `packages/admin` 将现有布局改为固定三栏（sidebar / content slot / chat window）
- [x] 1.2 保持现有路由结构（`/apps`、`/apps/:appName`、`/apps/:appName/:pageId`）并接入新壳层
- [x] 1.3 让中心 content slot 承载 App 页面渲染，壳层区域在路由切换时不重建
- [x] 1.4 为右侧 chat window 添加首期 UI（占位或基础面板）

## 2. 状态与可用性

- [x] 2.1 在 content slot 内补齐 loading/empty/error 状态（无 UI、页面不存在）
- [x] 2.2 增加小屏响应式策略（sidebar/chat 折叠或收起）
- [x] 2.3 验证从 App 列表到页面详情的导航连续性

## 3. 测试与文档

- [x] 3.1 为三栏布局与 content slot 行为补充前端测试
- [x] 3.2 增加基础端到端场景测试（列表→页面、页面切换、异常状态）
- [x] 3.3 更新 README 中 Admin 布局说明（硬编码三栏 + content slot）
