## Why

无 workspace 时 Daemon 启动会自动 publish Welcome App，但 Admin 界面进入该 App 后报错"UI 尚未发布"。根本原因是 Runtime 模块缺少 `GET /stable/apps/:appName/ui` 端点——Admin 请求此路径获取 UI 定义，但 Runtime 只注册了 `/ui.json`，`/ui` 请求返回 404。`ui-reconcile-lifecycle` 规范中已定义该端点的要求，但在 Runtime 中未实现。

## What Changes

- 将 Runtime UI 路由中的 `GET /ui.json` **重命名**为 `GET /ui`，对齐 `ui-reconcile-lifecycle` 规范和 Admin 的请求路径
- 更新 Daemon 测试中对 `/ui.json` 的引用，改为 `/ui`
- **删除废弃的 `packages/server` 包**：该包在 Daemon + Runtime 拆分后已无任何引用，功能完全由 `packages/daemon` + `packages/runtime` 替代

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `ui-reconcile-lifecycle`: Runtime 中 `GET /ui.json` 重命名为 `GET /ui`，对齐规范定义的端点路径

## Impact

- `packages/runtime/src/modules/ui/routes.ts`（重命名 `GET /ui.json` → `GET /ui`）
- `packages/daemon/tests/scenarios/reconciler-e2e.test.ts`（更新测试中的 `/ui.json` → `/ui`）
- `packages/server/`（整个目录删除）
