## Why

Agent 操作 APP UI 存在三个结构性问题：(1) `create_app` 不生成 `ui/pages.json` 模板，Agent 必须手动创建该文件，容易产生格式错误；(2) 现有 MCP 工具只支持 page 内组件级操作（insert/update/move/delete），缺少 page 级操作（添加、删除、排序页面），Agent 被迫直接编辑 JSON 文件；(3) 所有 page 工具和组件工具都以 `page_` 前缀命名，语义不清晰。

## What Changes

- **BREAKING**: 将现有 6 个 `page_*` 组件级工具重命名为 `ui_*` 前缀（`page_outline` → `ui_outline`，`page_get` → `ui_get`，`page_insert` → `ui_insert`，`page_update` → `ui_update`，`page_move` → `ui_move`，`page_delete` → `ui_delete`）
- 新增 5 个 `pages_*` 页面级 MCP 工具：`pages_list`、`pages_add`、`pages_remove`、`pages_update`、`pages_reorder`
- `create_app` 创建 APP 时自动生成空白 `ui/pages.json`（`{"pages": []}`）模板文件
- 更新 Agent 指引（AGENT.md、SKILL.md），强调所有 UI 操作必须通过 MCP 工具完成，禁止手动编辑 `pages.json`

## Capabilities

### New Capabilities

- `page-level-editing`: 页面级结构化编辑能力——添加页面、删除页面、修改页面元信息（title）、调整页面顺序

### Modified Capabilities

- `page-schema-editing`: 现有组件级工具从 `page_*` 重命名为 `ui_*`，工具名称变更属于 spec 级别的接口变化
- `ai-app-creation-flow`: `create_app` 新增 `ui/pages.json` 空白模板文件到创建流程

## Impact

- **MCP 工具接口**: 6 个工具重命名（breaking），新增 5 个工具
- **代码文件**: `page-editor.ts`（新增 page-level 函数）、`server.ts`（注册新工具 + 重命名）、`handlers.ts`（新增 handler）、`mcp-types.ts`（新增 descriptions + input types）、`manager.ts`（添加模板文件）
- **Agent 指引**: `AGENT.md`、`add-page/SKILL.md` 需更新工具名称和操作方式
- **测试**: `page-editor.test.ts`、`page-tools.test.ts` 需添加新操作测试并更新重命名后的工具名
- **无运行时影响**: 工具重命名仅影响 Agent MCP 调用，不影响前端渲染或 backend 数据模型
