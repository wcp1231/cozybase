## Why

目前 UI 定义（`ui/pages.json`）直接从 `platform.sqlite` 的 `app_files` 表读取并渲染，修改后立即生效，绕过了 reconcile 流程。这与其他资源（migrations、seeds、functions）的处理方式不一致——那些资源必须经过 Draft Reconcile → Verify → Publish 的生命周期管理。UI 定义应该纳入同一套 reconcile 机制，确保一致性、可验证性和可回滚性。

## What Changes

- **BREAKING**: Admin Shell 不再直接从 `app_files` 读取 `ui/pages.json` 渲染 UI，改为从 Draft/Stable 上下文获取 UI 定义
- DraftReconciler 新增对 `ui/pages.json` 的处理：reconcile 时将 UI 定义导出到 Draft 环境
- Publisher 新增对 UI 定义的发布逻辑：publish 时将 UI 定义推送到 Stable 环境
- Admin Shell 区分 Draft 预览和 Stable 运行两种 UI 渲染模式
- 新增 API 端点，从 Draft/Stable 上下文获取已 reconcile 的 UI 定义

## Capabilities

### New Capabilities

- `ui-reconcile-lifecycle`: 定义 UI 定义如何通过 Draft → Reconcile → Verify → Publish 流程进行管理，包括导出、验证和发布逻辑

### Modified Capabilities

- `reconciler-draft-stable`: Reconcile 流程需要新增对 `ui/pages.json` 资源类型的处理（导出到 Draft、发布到 Stable）
- `admin-shell`: Admin Shell 需要从 Draft/Stable 上下文读取 UI 定义，而非直接从 `app_files` 获取

## Impact

- **Server 端**:
  - `packages/server/src/core/draft-reconciler.ts` — 新增 UI 定义导出步骤
  - `packages/server/src/core/publisher.ts` — 新增 UI 定义发布步骤
  - `packages/server/src/core/app-context.ts` — 可能需要管理 UI 定义的存储路径
  - `packages/server/src/modules/apps/routes.ts` — 新增从 Draft/Stable 获取 UI 的 API
- **Admin 端**:
  - `packages/admin/src/pages/app-layout.tsx` — 改为从 reconciled 上下文获取 UI 定义
  - `packages/admin/src/pages/app-page-view.tsx` — 适配新的 UI 数据来源
- **测试**:
  - `packages/server/tests/scenarios/reconciler-e2e.test.ts` — 新增 UI reconcile 场景
- **API 行为变更**: 修改 `ui/pages.json` 后不再立即生效，必须执行 reconcile 后才能在 Draft 预览中看到变化，执行 publish 后才能在 Stable 中生效
