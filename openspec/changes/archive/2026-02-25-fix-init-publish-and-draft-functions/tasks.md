## 1. 修复 App 状态推导

- [x] 1.1 修改 `packages/server/src/core/workspace.ts` 中 `refreshAppState()` 的 else 分支（第 243-245 行）：将 `state = 'stable'` 改为 `state = 'draft_only'`，并更新注释

## 2. 初始化后自动 Publish 模板应用

- [x] 2.1 修改 `packages/server/src/server.ts`：在 `workspace.init()` 之前记录 `justInitialized` 标记
- [x] 2.2 在 `createServer()` 中，`publisher` 创建之后，添加自动 Publish 逻辑：若 `justInitialized` 为 true，遍历 `workspace.scanApps()` 找到所有 `draft_only` 状态的 App 并调用 `publisher.publish()`

## 3. Draft Reconcile 增加函数复制步骤

- [x] 3.1 在 `packages/server/src/core/draft-reconciler.ts` 中添加 `copyFunctionsToDraft()` 私有方法：将 `apps/{name}/functions/` 下所有文件复制到 `draft/apps/{name}/functions/`（先清空目标目录再全量复制）
- [x] 3.2 在 `reconcile()` 方法中，seed 加载之后、函数验证之前，调用 `copyFunctionsToDraft()`
- [x] 3.3 修改 `validateFunctions()` 方法：将读取路径从 `apps/{name}/functions/` 改为 `draft/apps/{name}/functions/`

## 4. Draft 模式函数加载路径变更

- [x] 4.1 修改 `packages/server/src/modules/functions/direct-runtime.ts` 中 `execute()` 方法（第 29 行）：将 Draft 模式的 `baseDir` 从 `app.specDir` 改为 `app.draftDataDir`

## 5. 补充测试

- [x] 5.1 在 `tests/scenarios/reconciler-e2e.test.ts` 中添加测试场景：workspace 初始化后模板应用状态为 stable，且 stable DB 和 stable functions 目录存在可访问
- [x] 5.2 在 `tests/scenarios/reconciler-e2e.test.ts` 中添加测试场景：Draft Reconcile 后函数文件被复制到 `draft/apps/{name}/functions/` 目录
- [x] 5.3 在 `tests/scenarios/reconciler-e2e.test.ts` 中添加测试场景：修改源码 functions 后，未 Reconcile 时 draft functions 目录内容不变；Reconcile 后更新
- [x] 5.4 验证所有现有测试通过（`bun test`）
