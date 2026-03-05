## 1. 重构 page-editor.ts：拆分 InMemory 操作层

- [x] 1.1 从 `insertNode` 中提取 `insertNodeInMemory(data, parentId, nodeData, index?)` 纯内存函数，返回 `{ node, nodeId }`
- [x] 1.2 从 `updateNode` 中提取 `updateNodeInMemory(data, nodeId, props)` 纯内存函数
- [x] 1.3 从 `moveNode` 中提取 `moveNodeInMemory(data, nodeId, newParentId, index?)` 纯内存函数
- [x] 1.4 从 `deleteNode` 中提取 `deleteNodeInMemory(data, nodeId)` 纯内存函数
- [x] 1.5 提取 `getNodeInMemory(data, nodeId)` 纯内存函数（从 `getNode` 中抽出）
- [x] 1.6 从 `addPage` 中提取 `addPageInMemory(data, pageData, index?)` 纯内存函数
- [x] 1.7 从 `removePage` 中提取 `removePageInMemory(data, pageId)` 纯内存函数
- [x] 1.8 从 `updatePageMeta` 中提取 `updatePageMetaInMemory(data, pageId, props)` 纯内存函数
- [x] 1.9 将现有公共函数改为调用对应 InMemory 函数 + 文件 I/O 包装，确保外部行为不变
- [x] 1.10 运行现有 `page-tools.test.ts` 测试，确认重构后全部通过

## 2. 实现 `batchOperations` 核心逻辑

- [x] 2.1 在 `page-editor.ts` 中定义 batch 操作类型（`BatchOperation`、`BatchResult`、`BatchOperationResult`）
- [x] 2.2 实现 `$ref` 解析函数 `resolveRef(value, refMap)` 和 refMap 管理逻辑
- [x] 2.3 实现级联跳过逻辑：检测操作中的 `$ref` 引用是否指向失败/跳过的 ref，标记 `skipped`
- [x] 2.4 实现 `batchOperations(ctx, operations)` 主函数：一次读取、顺序执行、一次写入
- [x] 2.5 实现写入时机判断：仅当有成功的写操作时才调用 `writePagesJson()`，纯 get 批次不写入

## 3. 定义类型和注册 MCP 工具

- [x] 3.1 在 `mcp-types.ts` 中新增 `UiBatchInput` 和 `UiBatchOutput` 类型定义
- [x] 3.2 在 `mcp-types.ts` 中新增 `ui_batch` 的 `TOOL_DESCRIPTIONS` 描述文本
- [x] 3.3 在 `handlers.ts` 中新增 `handleUiBatch()` handler 函数
- [x] 3.4 在 `server.ts` 中注册 `ui_batch` 工具，使用 `z.discriminatedUnion("op", [...])` 定义 Zod schema
- [x] 3.5 在 `sdk-mcp-server.ts` 中同步注册 `ui_batch` 工具

## 4. 测试

- [x] 4.1 测试基本批量 insert：多个同级节点插入
- [x] 4.2 测试 `$ref` 引用：insert 后通过 ref 作为 parent_id 嵌套插入
- [x] 4.3 测试混合操作：insert + update + delete 在同一批次
- [x] 4.4 测试部分成功：中间操作失败，后续无关操作继续执行
- [x] 4.5 测试级联跳过：ref 失败导致依赖链上的操作被 skipped
- [x] 4.6 测试 page_add + insert 联合：创建页面并立即插入内容
- [x] 4.7 测试纯 get 批次不写入文件
- [x] 4.8 测试 update 操作中修改 `id`/`type` 被拒绝（与 `ui_update` 一致）
