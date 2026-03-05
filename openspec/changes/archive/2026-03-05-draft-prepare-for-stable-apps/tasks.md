## 1. 后端 Draft prepare API 与 reconcile force 支持

- [x] 1.1 在 `packages/daemon/src/core/draft-reconciler.ts` 为 `reconcile` 增加 `options.force` 参数，并在 `force` 开启时允许 `hasDraft == false` 继续执行
- [x] 1.2 保持默认 `reconcile` 行为不变：未开启 `force` 且 `hasDraft == false` 时仍返回原有错误语义
- [x] 1.3 在 `packages/daemon/src/server.ts` 新增 `POST /draft/apps/:appSlug/prepare` 路由，校验 APP 存在且已发布（`stable_status != null`）
- [x] 1.4 让 prepare 路由调用 `draftReconciler.reconcile(appSlug, { force: true })`，并在成功后启动或重启 Draft runtime
- [x] 1.5 为 prepare 路由补充幂等性处理与返回结构，确保重复调用不会创建重复 Draft runtime 实例且不修改 `current_version`

## 2. Daemon 启动时 Draft runtime 加载规则扩展

- [x] 2.1 调整 `initializeRuntime` 的 Draft 启动条件：保留 `hasDraft == true` 分支，同时支持“已发布 + 存在 `.reconcile-state.json` + `hasDraft == false`”场景
- [x] 2.2 复用 `appContext.hasDraftReconcileState()` 检测 Draft 是否已物化，避免新增状态字段
- [x] 2.3 确保 `stable_status == null` 或缺少 `.reconcile-state.json` 时不会误启动 Draft runtime

## 3. 前端 Draft 模式自动 prepare 流程

- [x] 3.1 在 `packages/web/src/pages/app-layout.tsx` 的 Draft 加载流程中，识别“已发布且 `hasDraft == false`”的 APP
- [x] 3.2 在该场景先调用 `POST /draft/apps/:appSlug/prepare`，成功后再请求 `GET /draft/apps/:appSlug/ui`
- [x] 3.3 保持已有 Draft（`hasDraft == true`）路径不变，避免多余 prepare 请求
- [x] 3.4 对 prepare 失败场景补充错误展示，避免落回“暂无 UI”误导状态

## 4. 测试与回归验证

- [x] 4.1 为 `DraftReconciler` 增加单元测试：覆盖 `force=true` 与默认模式的 `hasDraft == false` 分支
- [x] 4.2 为 Draft 管理 API 增加接口测试：覆盖 prepare 成功、未发布 APP 拒绝、重复调用幂等
- [x] 4.3 为 runtime 初始化增加测试：覆盖“已物化 Draft + hasDraft=false”会启动，以及“未物化”不会启动
- [x] 4.4 为前端 `app-layout` 增加测试：覆盖自动 prepare 成功链路、已有 Draft 不触发 prepare、prepare 失败提示
- [x] 4.5 运行并记录相关测试命令（daemon/web 受影响测试集），确认不引入现有 publish/reconcile 行为回归
