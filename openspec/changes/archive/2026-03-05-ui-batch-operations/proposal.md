## Why

当前 `ui_insert`、`ui_update`、`ui_delete` 等工具每次只能操作一个组件节点，构建一个完整页面布局需要多次 LLM 往返调用。每次调用都会经历完整的「读文件 → 反序列化 → 遍历查找 → 修改 → 校验 → 序列化 → 写文件」循环，造成显著的延迟和 token 开销。需要新增一个批量操作工具，让 Agent 能在单次调用中完成多个组件操作。

## What Changes

- 新增 `ui_batch` MCP 工具，支持在单次调用中执行多个组件操作（insert、update、delete、move、get）及页面级操作（page_add、page_remove、page_update）
- 支持 `$ref` 引用机制，让后续操作可以引用前序 insert 操作生成的节点 ID（解决操作间依赖问题）
- 重构 `page-editor.ts`，将现有函数拆分为纯内存操作层（`*InMemory`）和文件 I/O 包装层，batch 工具一次读文件、多次内存操作、一次写文件
- 采用部分成功策略：失败的操作不阻断后续无关操作，但依赖失败 ref 的操作会被级联跳过
- 现有 `ui_insert`、`ui_update` 等单操作工具保持不变（内部改为调用 InMemory 版本）

## Capabilities

### New Capabilities

- `ui-batch`: 批量 UI 组件操作能力，包括 `$ref` 引用机制、多操作类型混合执行、部分成功与级联跳过策略

### Modified Capabilities

- `page-schema-editing`: 将现有操作函数拆分为内存操作层和 I/O 层，为 batch 操作提供内部复用基础。现有工具的外部行为不变。

## Impact

- `packages/daemon/src/modules/apps/page-editor.ts` — 核心重构：拆出 InMemory 函数 + 新增 `batchOperations()`
- `packages/daemon/src/modules/apps/mcp-types.ts` — 新增 `UiBatchInput` / `UiBatchOutput` 类型定义
- `packages/daemon/src/mcp/handlers.ts` — 新增 `handleUiBatch()` handler
- `packages/daemon/src/mcp/server.ts` — 注册 `ui_batch` 工具 + Zod schema
- `packages/daemon/src/agent/sdk-mcp-server.ts` — 同步注册 `ui_batch`
- `packages/daemon/tests/mcp/page-tools.test.ts` — 新增 batch 相关测试用例
