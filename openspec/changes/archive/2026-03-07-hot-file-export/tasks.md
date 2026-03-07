## 1. Rebuild 语义收敛与接口重命名

- [x] 1.1 将 daemon 核心中的 `DraftReconciler` / `reconcile()` 重命名为 `DraftRebuilder` / `rebuild()`，并保持完整重建流程仍包含 Draft DB、functions、UI、依赖和配置处理
- [x] 1.2 将 `LocalBackend`、`RemoteBackend`、MCP tool schema 与 handler 中的 `reconcile_app` 重命名为 `rebuild_app`，同步更新返回类型与调用链
- [x] 1.3 更新 `prepare` 和 `manager.create()` 等复用重建流程的入口，使其统一调用 rebuild 语义并保留 `force` 等既有行为

## 2. 热导出能力落地

- [x] 2.1 在 `file-export` 模块新增 UI 单文件导出与 function 单文件导出能力，并补充按路径判断热导出 / rebuild 需求的公共逻辑
- [x] 2.2 改造 `AppManager.updateFile()`：写入 `app_files` 后对 `ui/pages.json` 和 `functions/*` 执行热导出，成功后发送 `app:reconciled` 事件，并返回 `needs_rebuild`
- [x] 2.3 改造 `AppManager.updateApp()`：批量更新后同步导出 `ui/pages.json`，对 `functions/` 执行全量重导出以处理删除场景，并正确汇总 `needs_rebuild`

## 3. Tool 描述与调用约定同步

- [x] 3.1 更新 `update_app` / `update_app_file` 的 tool description，移除“变更后必须调用 reconcile_app”的强提示，改为说明何时需要 `rebuild_app`
- [x] 3.2 更新 `update_app_file` 与相关响应 schema，明确暴露 `needs_rebuild: boolean` 字段给 Agent
- [x] 3.3 同步更新代码内 guide、注释与用户流程文案中涉及 `reconcile_app` 的路径，避免旧名称与新语义混用

## 4. 测试与回归验证

- [x] 4.1 为新增热导出函数补充单元测试，覆盖 UI 单文件导出、function 单文件导出和批量更新删除旧 function 文件的场景
- [x] 4.2 为 `AppManager` / MCP 路由补充测试，验证 `update_app_file`、`update_app` 的 `needs_rebuild` 判定与 `app:reconciled` 事件触发
- [x] 4.3 为 rebuild、prepare 和 AI 创建流程补充回归测试，确认重命名后 `rebuild_app`、stable-only prepare 与自动创建 Draft 环境行为保持正确
