## Why

当前存在两个影响平台核心工作流的 Bug：(1) Workspace 初始化后模板应用仅复制了文件但未 Publish，导致 Stable 路由无法访问；(2) Draft 模式的 Functions 直接从源码目录 (`apps/{name}/functions/`) 热重载，绕过了 Reconcile 流程，与 Draft DB 的隔离模型不一致。同时需要为这两处行为补充测试用例。

## What Changes

**Bug 1: 初始化后模板应用需自动 Publish**
- `workspace.init()` 完成文件复制和 git commit 后，SHALL 对每个模板应用执行 Publish 流程（创建 Stable DB、执行 Migration、复制 Functions 到 Stable 目录）
- 确保初始化后模板应用的状态为 **Stable**，Stable 路由可以正常访问

**Bug 2: Draft Functions 需通过 Reconcile 隔离**
- Draft Reconcile 流程增加一步：将 `apps/{name}/functions/` 下的函数文件复制到 `draft/apps/{name}/functions/`
- Draft 模式下 Functions 从 `draft/apps/{name}/functions/` 加载，而非直接从源码目录加载
- 修改源码目录的函数文件后，需要执行 Reconcile 才能在 Draft 模式下生效
- 这使 Functions 的生命周期与 DB 一致：编辑源码 → Reconcile → Draft 可用 → Publish → Stable 可用

**测试用例补充**
- 补充测试：初始化后模板应用可通过 Stable 路由访问 DB 和 Functions
- 补充测试：Draft Functions 修改源码后不立即生效，需 Reconcile 后才生效

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-management`: "Workspace 自动初始化" requirement 需要增加 Publish 模板应用的步骤
- `reconciler-draft-stable`: "Draft Reconcile" requirement 需要增加复制 Functions 到 draft 目录的步骤
- `function-runtime`: "DirectRuntime 实现" requirement 中 Draft 模式需要从 `draft/apps/{name}/functions/` 加载函数，而非从源码目录 `apps/{name}/functions/` 热重载

## Impact

- **代码**:
  - `packages/server/src/core/workspace.ts` — init() 需调用 Publish 逻辑
  - `packages/server/src/core/draft-reconciler.ts` — reconcile() 需复制函数文件到 draft 目录
  - `packages/server/src/modules/functions/direct-runtime.ts` — Draft 模式文件路径变更
- **测试**: 新增 E2E 测试覆盖两个 Bug 场景
- **Spec 变更**: 涉及 3 个现有 spec 的 MODIFIED requirements
- **行为变更**: Draft Functions 不再热重载，需要 Reconcile 后才生效（开发体验变化）
