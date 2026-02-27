## Context

Admin 界面通过 `GET /stable/apps/:appName/ui` 获取 App 的 UI 定义（`pages.json`），并以 `{ data: <content> }` 格式期待响应。

当前 Runtime 模块（`packages/runtime/src/modules/ui/routes.ts`）在 `/stable/apps/:name` 下注册了以下路由：
- `GET /ui.json` — 返回 UI schema（与 `/ui` 功能完全相同）
- `GET /assets/*` — 返回静态资源
- `GET /` — 返回 `index.html`

但 **没有 `GET /ui`** 路由。Admin 请求 `/stable/apps/welcome/ui` 时，Hono 匹配不到任何 handler，返回 404。

此外，`packages/server` 是 Daemon + Runtime 拆分前的旧单体实现。拆分后（commit `58ccc0e`）该包已无任何引用，所有功能由 `packages/daemon` + `packages/runtime` 完全替代，应予以删除。

## Goals / Non-Goals

**Goals:**
- 将 Runtime UI 路由的 `GET /ui.json` 重命名为 `GET /ui`，对齐规范和 Admin 请求路径
- 同时覆盖 stable 和 draft 路径（两者均通过 `createUiRoutes()`）
- 删除废弃的 `packages/server` 包

**Non-Goals:**
- 不修改 Admin 客户端的请求路径
- 不修改 Welcome App 模板内容（`ui/pages.json` 已存在）

## Decisions

### 重命名 `/ui.json` 为 `/ui`（而非新增端点）

**选择**：将 `createUiRoutes()` 中的 `GET /ui.json` 重命名为 `GET /ui`。

**理由**：
- `/ui.json` 和 `/ui` 功能完全相同：读取同一份 `pages.json`，返回相同的 `{ data: <content> }` 格式
- `/ui.json` 仅在 Daemon 测试中被使用，无外部消费者
- `ui-reconcile-lifecycle` 规范定义的端点路径为 `/ui`，不是 `/ui.json`
- 重命名比新增更简洁，避免两个功能重复的端点

**备选方案**：保留 `/ui.json` 并新增 `/ui`。缺点是两个端点功能完全重复，增加维护负担且无明确消费者区分。

### 删除 `packages/server`

**选择**：完整删除 `packages/server/` 目录。

**理由**：
- 根目录 `package.json` 的 dev/mcp 脚本均指向 `packages/daemon`
- 项目中无任何代码 import 或引用 `packages/server`
- 其功能已被 `packages/daemon`（管理层）和 `packages/runtime`（执行层）完全替代
- 保留废弃包会造成混淆（如本次 bug 的分析过程中就产生了干扰）

## Risks / Trade-offs

- **删除 `packages/server` 不可逆** → 风险低，Git 记录完整可恢复，且该包已确认无引用
- **Daemon 测试需同步更新** → `/ui.json` → `/ui`，仅涉及两个测试用例的 URL 修改

## Migration Plan

1. 将 `packages/runtime/src/modules/ui/routes.ts` 中的 `GET /ui.json` 重命名为 `GET /ui`
2. 更新 `packages/daemon/tests/scenarios/reconciler-e2e.test.ts` 中的 `/ui.json` → `/ui`
3. 删除 `packages/server/` 目录
4. 验证：启动 Daemon（无 workspace），进入 Welcome App，确认不再报错
