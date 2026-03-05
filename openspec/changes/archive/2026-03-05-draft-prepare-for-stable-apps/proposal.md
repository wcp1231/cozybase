## Why

当一个 APP 处于 Stable-only 状态（`current_version == published_version`，`hasDraft == false`）时，用户在 Builder（draft）模式点击该 APP 会遇到"暂无 UI 界面"提示，刷新页面甚至 404。原因是 publish 后 draft 环境被完全清理（draft DB 删除、draft UI 目录删除、draft runtime 停止），且系统不会为 `hasDraft == false` 的 APP 注册 draft runtime。这导致已发布的 Stable APP 无法进入编辑状态，阻断了"编辑已发布应用"的核心工作流。

## What Changes

- 新增 `POST /draft/apps/:appSlug/prepare` API，用于为 stable-only APP 按需创建 draft 环境（reconcile + 启动 draft runtime），不改变 `current_version`
- `DraftReconciler.reconcile()` 新增 `force` 选项，允许在 `hasDraft == false` 时跳过校验并执行 reconcile
- 前端 `app-layout.tsx` 在 draft 模式加载 stable-only APP 时，自动调用 prepare API，等 draft 环境就绪后再加载 UI

## Capabilities

### New Capabilities

- `draft-prepare`: 为 stable-only APP 按需创建 draft 环境的能力，包括 prepare API 端点、reconcile force 模式、前端自动触发逻辑

### Modified Capabilities

- `app-stable-lifecycle`: 明确 Daemon 启动时的 draft runtime 加载逻辑——仅当 `hasDraft == true` 且 draft 环境已物化（`.reconcile-state.json` 存在）时启动；`hasDraft == false` 的 prepare 残留状态不自动恢复，由前端按需再次触发 prepare

## Impact

- **后端 API**: 新增 `POST /draft/apps/:appSlug/prepare` 路由（`packages/daemon/src/server.ts`）
- **Core 模块**: `DraftReconciler.reconcile()` 签名变更，新增 `force` 参数（`packages/daemon/src/core/draft-reconciler.ts`）
- **前端**: `app-layout.tsx` 的 `refreshApp` 函数增加 prepare 调用逻辑（`packages/web/src/pages/app-layout.tsx`）
- **Runtime 启动**: `initializeRuntime` 中 draft runtime 的启动条件调整（`packages/daemon/src/server.ts`）
