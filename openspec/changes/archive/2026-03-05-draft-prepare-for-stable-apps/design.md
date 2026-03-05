## Context

当前系统中，APP 的 draft 和 stable 是两个独立的运行时环境，各自拥有独立的 DB、functions 目录和 UI 目录。Publish 操作完成后会清理 draft 环境（删除 draft DB、draft UI 目录、停止 draft runtime），并将 `published_version` 对齐到 `current_version`，使 `hasDraft` 变为 false。

此后用户在 Builder 模式点击该 APP 时，前端向 `/draft/apps/:name/ui` 发请求，但 draft runtime 未注册，返回 404。前端显示"暂无 UI"或页面 404。

关键文件：
- `packages/daemon/src/server.ts` — 路由定义、draft management middleware、runtime 初始化
- `packages/daemon/src/core/draft-reconciler.ts` — draft 环境重建逻辑
- `packages/runtime/src/middleware/app-entry-resolver.ts` — runtime 请求路由，找不到 entry 返回 404
- `packages/web/src/pages/app-layout.tsx` — 前端加载 APP 信息和 UI 的入口

## Goals / Non-Goals

**Goals:**

- 用户在 Builder 模式能编辑任何已发布的 APP，无需手动操作
- 按需创建 draft 环境，不浪费资源保持不需要的 draft runtime
- prepare 操作幂等，多次调用安全无副作用
- 不改变 `current_version`——prepare 只是物化现有内容，不代表用户做了编辑

**Non-Goals:**

- 不改变 publish 后清理 draft 的行为（这是合理的资源回收）
- 不在 Daemon 启动时自动恢复所有 prepare 过的 draft 环境（通过前端按需触发即可）
- 不引入新的 APP 状态字段（复用现有的 `hasDraft` + 物化检测）

## Decisions

### Decision 1: 新增 `POST /draft/apps/:appSlug/prepare` 端点

**选择**: 新增专用 API 端点，而非复用 reconcile 端点。

**原因**: reconcile 的语义是"同步 draft 变更"，前置校验要求 `hasDraft == true`。prepare 的语义是"为 stable-only APP 物化 draft 环境"，需要绕过 `hasDraft` 检查。分开端点语义更清晰，也避免改变 reconcile 的调用方行为。

**替代方案**: 给 reconcile 加 query parameter `?force=true` → 语义混乱，现有调用方可能误用。

### Decision 2: `DraftReconciler.reconcile()` 新增 `options.force` 参数

**选择**: 在 reconcile 方法签名中增加 `options?: { force?: boolean }`，当 `force == true` 时跳过 `hasDraft` 校验。

**原因**: prepare 的核心逻辑与 reconcile 完全一致（从 Platform DB 导出 migrations/functions/UI 到 draft 目录，重建 draft DB），没必要复制一份。通过 `force` 参数复用已有逻辑，只绕过前置检查。

**替代方案**: 新增独立的 `prepare()` 方法 → 代码重复度高，且 reconcile 的核心步骤（签名检测、增量重建、export）完全可复用。

### Decision 3: 前端在 `refreshApp` 中自动检测并调用 prepare

**选择**: 在 `app-layout.tsx` 的 `refreshApp` 函数中，当 `mode === 'draft'` 且 `appData.hasDraft === false` 且 `appData.stableStatus !== null` 时，自动 POST prepare，然后重新 fetch UI。

**原因**: 这是用户无感知的最佳体验。不需要额外的"开始编辑"按钮或中间页面。prepare 通常很快（migrations 签名匹配时跳过 DB 重建），用户只会感知到一个短暂的 loading。

**替代方案**: 显示一个"开始编辑"按钮让用户手动触发 → 增加不必要的交互步骤，对于一个预期行为来说过于繁琐。

### Decision 4: prepare 后不修改 `current_version`

**选择**: prepare 只物化 draft 环境（导出文件、启动 runtime），不调用 `incrementVersion`。

**原因**: prepare 没有产生任何新的文件变更，只是把 Platform DB 中已有的内容导出到 draft 目录。`current_version` 只在 `update_app_file`（实际编辑）时递增。这意味着 prepare 后 `hasDraft` 仍为 false，直到用户做出第一个实际编辑。

### Decision 5: Daemon 启动时不自动恢复 prepare 状态

**选择**: Daemon 重启后，prepare 产生的 draft 环境不会自动启动 draft runtime（因为 `hasDraft == false`）。前端再次进入 Builder 时会重新触发 prepare。

**原因**:
- prepare 的 draft 目录和 `.reconcile-state.json` 在磁盘上保留着，re-prepare 时签名匹配可跳过 DB 重建，速度很快
- 避免为所有曾经 prepare 过但未编辑的 APP 浪费 runtime 资源
- 保持启动逻辑简单：只关注 `hasDraft == true` 的 APP

## Risks / Trade-offs

**[Risk] prepare 后 `hasDraft` 仍为 false，状态语义不完全准确** → 可接受。draft runtime 正在运行但 `hasDraft == false` 是一个过渡态，用户一旦编辑就会进入正常的 `hasDraft == true` 状态。前端已经在列表中显示所有 APP（不按 `hasDraft` 过滤），所以不影响可见性。

**[Risk] Daemon 重启后 prepare 状态丢失，需要重新 prepare** → 影响很小。reconcile 有签名缓存机制（`.reconcile-state.json`），re-prepare 时如果 migrations 没变，跳过 DB 重建，只需 export files + 启动 runtime，耗时极短。

**[Risk] prepare 调用期间的 loading 体验** → 对于大多数 APP，prepare（含 reconcile）在毫秒级完成。只有首次 prepare（需要重建 draft DB、运行所有 migrations、bun install）可能需要几秒。前端已有 loading 状态，用户体验可接受。
