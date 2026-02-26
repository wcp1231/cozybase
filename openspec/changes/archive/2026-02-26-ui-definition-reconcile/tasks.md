## 1. UI 文件导出基础设施

- [x] 1.1 在 `packages/server/src/core/file-export.ts` 中新增 `exportUiFromDb(platformDb, appName, targetDir)` 函数，从 `app_files` 查询 `ui/pages.json` 并写入目标路径
- [x] 1.2 为 `exportUiFromDb` 编写单元测试：有 UI 文件时正常导出、无 UI 文件时跳过、覆盖旧文件、删除后清理旧文件

## 2. DraftReconciler 集成 UI 导出

- [x] 2.1 修改 `DraftReconcileResult` 类型，新增 `ui?: { exported: boolean }` 字段
- [x] 2.2 在 `DraftReconciler.reconcile()` 中函数验证步骤之后、返回结果之前，调用 `exportUiFromDb` 导出 UI 到 `draft/apps/{appName}/ui/pages.json`
- [x] 2.3 确保 UI 导出为非阻塞：捕获异常，失败时设置 `ui: { exported: false }` 但不影响整体 `success`

## 3. Publisher 集成 UI 导出

- [x] 3.1 修改 `PublishResult` 类型，新增 `ui?: { exported: boolean }` 字段
- [x] 3.2 在 `Publisher.publish()` 中导出 function 之后，调用 `exportUiFromDb` 导出 UI 到 `data/apps/{appName}/ui/pages.json`
- [x] 3.3 确保 UI 导出为非阻塞：捕获异常，失败时记录但不影响 Publish 结果
- [x] 3.4 在 `Publisher.cleanup()` 中新增清理 `draft/apps/{appName}/ui/` 目录的逻辑（best-effort）

## 4. Draft/Stable UI 读取 API

- [x] 4.1 在 `packages/server/src/server.ts` 中为 Draft 路由组新增 `GET /draft/apps/:appName/ui` 端点，从 `draft/apps/{appName}/ui/pages.json` 读取并返回 JSON
- [x] 4.2 在 `packages/server/src/server.ts` 中为 Stable 路由组新增 `GET /stable/apps/:appName/ui` 端点，从 `data/apps/{appName}/ui/pages.json` 读取并返回 JSON
- [x] 4.3 处理文件不存在情况：返回 404 `{ "error": "UI definition not found" }`

## 5. Admin Shell 适配

- [x] 5.1 修改 `packages/admin/src/pages/app-layout.tsx`：UI 定义改为从 `GET /stable/apps/:appName/ui` 获取，不再从 `app_files` 中解析 `ui/pages.json`
- [x] 5.2 处理 404 响应：显示 "该 App 的 UI 尚未发布，请先执行 reconcile 和 publish" 提示
- [x] 5.3 保留 App 元数据（name、state 等）从 `GET /api/v1/apps/:appName` 获取的逻辑

## 6. 端到端测试

- [x] 6.1 在 `packages/server/tests/scenarios/reconciler-e2e.test.ts` 中新增测试场景：Draft Reconcile 含 UI 导出，验证 `draft/apps/{appName}/ui/pages.json` 文件存在且内容正确
- [x] 6.2 新增测试场景：Publish 含 UI 导出，验证 `data/apps/{appName}/ui/pages.json` 文件存在且内容正确
- [x] 6.3 新增测试场景：无 UI 定义时 Reconcile/Publish 正常完成，返回结果不含 `ui` 字段
- [x] 6.4 新增测试场景：`GET /stable/apps/:appName/ui` 返回正确的 JSON 内容
- [x] 6.5 新增测试场景：`GET /stable/apps/:appName/ui` 文件不存在时返回 404
