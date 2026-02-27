## 1. Runtime UI 路由修复

- [x] 1.1 将 `packages/runtime/src/modules/ui/routes.ts` 中的 `app.get('/ui.json', ...)` 重命名为 `app.get('/ui', ...)`，注释同步更新

## 2. 测试更新

- [x] 2.1 将 `packages/daemon/tests/scenarios/reconciler-e2e.test.ts` 中所有 `/ui.json` 引用改为 `/ui`（涉及 Scenario 9.14 和 9.15 的 test 名称及请求路径）

## 3. 删除废弃的 server 包

- [x] 3.1 删除 `packages/server/` 目录
- [x] 3.2 检查根目录 `package.json` 中是否有对 `packages/server` 的 workspace 引用，如有则移除

## 4. 验证

- [x] 4.1 运行 daemon 测试，确认 UI 相关测试通过
- [x] 4.2 手动验证：无 workspace 启动 Daemon，进入 Welcome App，确认不再报错
