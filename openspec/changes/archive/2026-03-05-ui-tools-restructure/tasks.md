## 1. Page-level 编辑能力实现

- [x] 1.1 在 `packages/daemon/src/modules/apps/page-editor.ts` 新增 `pages_list` 对应的页面摘要读取能力，返回 `id` 与 `title`
- [x] 1.2 在 `packages/daemon/src/modules/apps/page-editor.ts` 实现 `pages_add`，支持显式 `id`、默认空 `body`，并写回 `ui/pages.json`
- [x] 1.3 在 `packages/daemon/src/modules/apps/page-editor.ts` 实现 `pages_remove` 与 `pages_update`（仅更新页面元信息，不修改 `id`）
- [x] 1.4 在 `packages/daemon/src/modules/apps/page-editor.ts` 实现 `pages_reorder`（按 `pageId + index` 的 move 语义调整顺序）
- [x] 1.5 为 `pages_add` 增加页面 `id` 格式与唯一性校验，并在失败时保证 `ui/pages.json` 不发生部分写入

## 2. 组件级工具重命名为 `ui_*`

- [x] 2.1 在 `packages/daemon/src/modules/apps/mcp-types.ts` 将 `page_outline/page_get/page_insert/page_update/page_move/page_delete` 全部重命名为 `ui_*`
- [x] 2.2 在 `packages/daemon/src/mcp/handlers.ts` 更新 `ui_*` handler 映射，保持与现有 page-editor 行为一致
- [x] 2.3 在 `packages/daemon/src/mcp/server.ts` 与 `packages/daemon/src/agent/sdk-mcp-server.ts` 注册新 `ui_*` 工具名并移除旧 `page_*` 注册
- [x] 2.4 统一更新代码中对旧 `page_*` 名称的引用，确保运行时不再暴露旧工具名

## 3. 新增 `pages_*` MCP 工具接入

- [x] 3.1 在 `packages/daemon/src/modules/apps/mcp-types.ts` 定义 `pages_list/pages_add/pages_remove/pages_update/pages_reorder` 的描述与 input schema
- [x] 3.2 在 `packages/daemon/src/mcp/handlers.ts` 实现 `pages_*` 对应 handler，并接入 page-editor 新增能力
- [x] 3.3 在 `packages/daemon/src/mcp/server.ts` 与 `packages/daemon/src/agent/sdk-mcp-server.ts` 注册 `pages_*` 工具
- [x] 3.4 验证 `pages_*` 与 `ui_*` 组合调用时均基于 Agent working copy 的最新 `ui/pages.json`

## 4. APP 创建模板与 Agent 指引更新

- [x] 4.1 在 `packages/daemon/src/modules/apps/manager.ts` 的 `create_app` 模板文件中新增 `ui/pages.json`，内容为 `{"pages": []}`
- [x] 4.2 为 `create_app` 新增模板文件初始化测试，确保新 APP 默认包含可解析的空白页面文件
- [x] 4.3 更新 `AGENT.md`，明确 UI 操作仅允许通过 `pages_*` / `ui_*` MCP 工具，禁止手动编辑 `ui/pages.json`
- [x] 4.4 更新 `add-page` 相关 `SKILL.md` 示例与说明，改用 `pages_*` / `ui_*` 新工具名

## 5. 测试与回归验证

- [x] 5.1 更新 `page-editor` 单元测试，覆盖 `pages_list/pages_add/pages_remove/pages_update/pages_reorder` 的成功与失败路径
- [x] 5.2 更新 MCP 工具测试（如 `page-tools.test.ts`），验证 `ui_*` 重命名后的行为与参数兼容预期
- [x] 5.3 新增 `pages_*` MCP 集成测试，覆盖页面新增、删除、改名、排序及与 `ui_*` 的联动场景
- [x] 5.4 执行相关测试套件并修复回归，确认旧 `page_*` 不可用且新工具链路全部通过
