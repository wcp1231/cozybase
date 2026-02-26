## Context

当前系统采用 Database-first 架构，所有 App 资源存储在 `platform.sqlite` 的 `app_files` 表中，通过 path 前缀区分资源类型（`migrations/`、`seeds/`、`functions/`）。这些资源通过 DraftReconciler → Verifier → Publisher 的生命周期管理，确保 Draft 与 Stable 环境的一致性。

然而 UI 定义（`ui/pages.json`）是个例外。Admin Shell 通过 `GET /api/v1/apps/:name` 获取全量 `app_files`，直接解析 `ui/pages.json` 渲染页面。修改 UI 定义后立即生效，完全绕过了 reconcile 流程。这导致：

1. UI 定义与其他资源的管理方式不一致
2. 无法在发布前预览 UI 变更（Draft 预览）
3. UI 变更无法回滚（没有经过 Draft → Stable 的生命周期）

## Goals / Non-Goals

**Goals:**

- UI 定义纳入现有 reconcile 流程，与 migrations、seeds、functions 一视同仁
- Reconcile 时将 `ui/pages.json` 导出到 Draft 文件系统
- Publish 时将 `ui/pages.json` 导出到 Stable 文件系统
- Admin Shell 从 Stable 文件系统读取 UI 定义进行渲染
- 提供 API 端点从 Draft/Stable 获取 reconciled UI 定义

**Non-Goals:**

- 不实现 UI 定义的 diff/merge 逻辑（UI 是整文件替换，不存在增量合并）
- 不实现 UI 定义的版本历史或回滚 UI（依赖现有 app 版本机制即可）
- 不实现 UI 实时热更新（WebSocket/SSE 推送）
- 不改变 `ui/pages.json` 在 `app_files` 表中的存储方式

## Decisions

### Decision 1: UI 定义以 JSON 文件形式导出到文件系统

**选择**: 与 functions 的处理方式一致，将 `ui/pages.json` 从 `app_files` 表导出为文件系统上的 JSON 文件。

**路径规范**:
- Draft: `draft/apps/{appName}/ui/pages.json`
- Stable: `data/apps/{appName}/ui/pages.json`

**替代方案**: 将 UI 定义存入 Draft/Stable SQLite 数据库的专用表。
**否决理由**: 增加了不必要的复杂度。UI 定义是单个 JSON 文件，不需要数据库索引或查询能力。文件系统导出与 functions 保持统一模式，简单可靠。

### Decision 2: 复用 file-export 模式，新增通用的文件导出函数

**选择**: 新增 `exportFileFromDb` 通用函数（或直接在 reconciler/publisher 中内联实现），将 `app_files` 中指定 path 的内容写入目标目录。

**理由**: `exportFunctionsFromDb` 处理的是 `functions/*` 前缀下的多个文件。UI 定义只有一个文件（`ui/pages.json`），逻辑更简单——直接读取并写入即可，不需要遍历文件列表。可以在 `file-export.ts` 中新增一个简单的单文件导出函数，也可以直接内联在 reconciler 和 publisher 中。

### Decision 3: 新增 Draft/Stable UI API 端点

**选择**: 在现有路由结构中新增端点：
- `GET /draft/apps/:appName/ui` — 从 Draft 文件系统读取 UI 定义
- `GET /stable/apps/:appName/ui` — 从 Stable 文件系统读取 UI 定义

**理由**: 与现有的 `/draft/apps/:appName/db/*` 和 `/stable/apps/:appName/db/*` 模式一致。Admin Shell 改为调用 Stable 端点获取 UI 定义，不再从 `app_files` 直接解析。

**替代方案**: 在 `GET /api/v1/apps/:name` 返回中区分 draft/stable UI。
**否决理由**: 混淆了管理 API（CRUD app_files）和运行时 API（读取 reconciled 资源）的职责。

### Decision 4: Admin Shell 默认读取 Stable UI

**选择**: Admin Shell 的 `app-layout.tsx` 改为调用 `GET /stable/apps/:appName/ui` 获取 UI 定义。

**理由**: 用户看到的应该是已发布的稳定版本。Draft 预览是独立场景，可以在后续需要时扩展（例如在 Admin 中增加 "Preview Draft" 模式）。

**新数据流**:
```
app_files (source of truth)
  → reconcile → draft/apps/{appName}/ui/pages.json
  → publish   → data/apps/{appName}/ui/pages.json
                  → GET /stable/apps/:appName/ui
                    → Admin Shell 渲染
```

### Decision 5: Reconcile 结果中包含 UI 信息

**选择**: `DraftReconcileResult` 新增 `ui` 字段，记录是否成功导出了 UI 定义。`PublishResult` 类似。

```typescript
interface DraftReconcileResult {
  // ... existing fields
  ui?: { exported: boolean };
}
```

**理由**: 保持结果结构的完整性，让调用者知道 UI 定义是否参与了 reconcile。UI 导出是非阻塞的——如果 `ui/pages.json` 不存在，不算错误（有些 app 可能没有 UI）。

### Decision 6: 首次 Publish 时的 auto-reconcile 处理

**选择**: 模板 app（如 welcome app）通过 `autoPublish` 机制直接发布时，也需要导出 UI 文件到 Stable 目录。这在 Publisher 中统一处理，无需额外逻辑。

**理由**: Publisher 已经处理 `draft_only` 状态的首次发布。只要在 publish 流程中加入 UI 导出步骤，模板 app 的 auto-publish 自然就能正确处理 UI 文件。

## Risks / Trade-offs

**[Breaking Change] 修改 UI 后必须 reconcile 才能生效** → 这是预期行为变更。需要确保 MCP tools 和 Admin Shell 在修改 `ui/pages.json` 后提示用户执行 reconcile。文档需要更新。

**[风险] Stable UI 文件不存在时的降级处理** → 对于已存在但尚未经过新版 reconcile 的 app，Stable 目录下不会有 `ui/pages.json` 文件。API 端点应返回 404 或空响应，Admin Shell 需要处理这种情况并给出有意义的提示（如 "请先执行 reconcile 和 publish"）。可考虑提供一次性迁移脚本为现有 app 补齐 Stable UI 文件。

**[风险] UI 导出失败不应阻塞整体 reconcile** → 与 function validation 类似，UI 导出采用非阻塞策略。导出失败记录在结果中但不让整个 reconcile 失败。这样即使 `ui/pages.json` 格式有问题，数据库 migrations 和 seeds 仍然能正常执行。

**[Trade-off] 单文件 vs 多文件 UI** → 当前设计假设 UI 定义是单个 `ui/pages.json` 文件。如果未来 UI 定义扩展为多文件（如每个页面一个文件），需要改为类似 functions 的批量导出模式。但当前设计足够简单，不需要过度设计。
