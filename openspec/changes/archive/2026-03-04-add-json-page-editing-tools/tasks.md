## 1. Schema 与校验基础设施

- [x] 1.1 将 `packages/ui/src/schema/types.ts` 迁移为以 Zod 为可信源的 schema 结构，并继续导出兼容的 TypeScript 类型
- [x] 1.2 新增 `packages/ui/src/schema/id.ts`、`normalize.ts`、`validate.ts`、`categories.ts`，实现组件 ID 生成、缺失 ID 补齐、结构校验和分类映射
- [x] 1.3 实现 `pages.json` 的语义校验规则，至少覆盖组件 ID 唯一性和 `reload.target` 引用有效性
- [x] 1.4 调整 `sync-ui-guide-props.ts` 及相关 schema 消费代码，使其从新的 Zod schema 来源读取定义

## 2. Page 编辑核心逻辑

- [x] 2.1 在 `packages/daemon/src/modules/apps/page-editor.ts` 实现 `ui/pages.json` working copy 的读取、查找和写回能力
- [x] 2.2 实现 `page_outline` 所需的大纲生成逻辑，返回页面层级、组件层级和摘要信息
- [x] 2.3 实现 `page_get` 的按节点 ID 读取能力，返回指定节点的完整 schema 详情
- [x] 2.4 实现 `page_insert`，支持在合法父节点下插入新节点并自动生成稳定组件 ID
- [x] 2.5 实现 `page_update`，仅允许更新可变属性并拒绝修改 `id`、`type` 等结构关键字段
- [x] 2.6 实现 `page_move` 和 `page_delete`，确保节点重排与删除后页面树仍保持合法结构
- [x] 2.7 为所有页面写操作接入写前规范化、结构校验和语义校验，并在失败时保证 working copy 不被部分写入

## 3. MCP 工具接入

- [x] 3.1 在 `packages/daemon/src/modules/apps/mcp-types.ts` 定义 `page_outline`、`page_get`、`page_insert`、`page_update`、`page_move`、`page_delete` 的工具描述和入参 schema
- [x] 3.2 在 `packages/daemon/src/mcp/handlers.ts` 实现上述 page 工具的 handler，并与 working copy 读写流程集成
- [x] 3.3 在 `packages/daemon/src/mcp/server.ts` 和 `packages/daemon/src/agent/sdk-mcp-server.ts` 注册上述 page 工具
- [x] 3.4 确认 page 工具与现有 `fetch_app` / `update_app_file` / `update_app` 工作流协同工作，读取结果始终反映 working copy 最新状态

## 4. 测试与文档

- [x] 4.1 为 schema 规范化与校验新增单元测试，覆盖缺失 ID 补齐、未知组件类型、重复 ID 和无效 `reload.target`
- [x] 4.2 为 page 编辑核心逻辑新增单元测试，覆盖 outline、读取、插入、更新、移动、删除和失败回滚
- [x] 4.3 为 MCP page 工具新增集成测试，验证 daemon MCP server 与 SDK MCP server 的行为一致性
- [x] 4.4 更新 Agent 工作流文档，说明 page 工具的适用场景、working copy 语义和推荐调用顺序
