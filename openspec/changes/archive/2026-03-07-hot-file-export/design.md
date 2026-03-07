## Context

当前架构中，文件从编辑到生效需要经过两步：

```
app_files 表 (DB)  ──update_app/update_app_file──▶  app_files 写入
                   ──reconcile_app──────────────▶  导出到 draft 目录 + 重建 DB + bun install
                                                    ↓
                                              runtime 从 disk 读取
```

Runtime 从 draft 目录（磁盘文件）读取 UI 和 functions，而非直接读取 `app_files` 表。因此即使 DB 已更新，runtime 也看不到变更，直到 reconcile 完成磁盘导出。

reconcile 是全量操作：每次都检查 migration signature、导出所有 functions、导出 UI、检查 package.json、验证函数导出——无论实际只改了一行 CSS class。

## Goals / Non-Goals

**Goals:**

- UI 和 functions 文件变更在 `update_app` / `update_app_file` 调用后即时生效（< 10ms 额外开销）
- 减少 Agent tool 调用数量：90%+ 的编辑场景不再需要单独调用 rebuild
- 浏览器自动刷新体验不变（复用现有 `app:reconciled` 事件机制）
- `rebuild_app` 保留为显式 tool，用于 migrations/seeds/deps/config 等重量级变更

**Non-Goals:**

- 不改变 runtime 的文件读取机制（仍从 disk 读取，不改为从 DB 直接读取）
- 不实现 debounce / 合并机制（每次 update 调用立即导出，简单直接）
- 不修改 Publisher（publish 流程不变，仍使用全量导出）
- 不删除 `DraftReconciler` 类（保留并重命名，职责收窄）

## Decisions

### Decision 1: 热导出逻辑放在 `AppManager` 而非 `DraftReconciler`

**选择**: 在 `AppManager.updateFile()` 和 `updateApp()` 中，DB 写入完成后根据路径直接调用导出函数。

**备选方案**: 在 `DraftReconciler` 中新增轻量级方法。

**理由**: 热导出的触发点是"文件被写入"，这是 `AppManager` 的职责。`DraftReconciler`（重命名后）专注于 DB 重建等重操作。将两种导出逻辑分到不同层级更清晰。此外，`AppManager` 已经持有 `workspace` 引用，能直接获取 `draftDataDir`。

### Decision 2: 单文件导出 vs 全量重新导出

**选择**: 新增两个轻量导出函数用于热路径，保留现有全量导出函数供 rebuild 使用。

```
热路径（新增）:
  exportSingleFunction(draftDataDir, relativePath, content)  — 写入单个文件
  exportUiFile(draftDataDir, content)                        — 写入 ui/pages.json

rebuild 路径（保留）:
  exportFunctionsFromDb(repo, appName, dir)  — 全量清除 + 重新导出
  exportUiFromDb(repo, appName, dir)         — 从 DB 读取并写入
```

**理由**: 热路径已经持有文件内容（刚写入 DB），无需再从 DB 读取。直接写磁盘即可，开销 < 1ms。全量导出函数在 rebuild 和 publish 中仍然需要（确保一致性）。

### Decision 3: `update_app`（批量）的 functions 导出策略

**选择**: 批量更新时，对 functions 目录执行全量重新导出（`exportFunctionsFromDb`），而非逐文件增量。

**理由**: `updateApp()` 是全量同步——可能有文件被删除。逐文件增量导出需要额外处理"哪些旧文件要从 disk 删除"的逻辑。全量导出（先 `rmSync` 再写入所有文件）更简单可靠，且对于典型 APP（< 20 个 function 文件）开销可忽略。

### Decision 4: `needs_rebuild` 的判定规则

**选择**: 根据变更文件的路径前缀判定：

| 路径模式 | 热导出 | needs_rebuild |
|----------|--------|---------------|
| `ui/pages.json` | 写入 `draft/{app}/ui/pages.json` | `false` |
| `functions/*` | 写入 `draft/{app}/functions/*` | `false` |
| `migrations/*` | 不导出 | `true` |
| `seeds/*` | 不导出 | `true` |
| `package.json` | 不导出 | `true` |
| `app.yaml` | 不导出 | `true` |
| 其他路径 | 不导出 | `false` |

对于 `update_app`（批量），`needs_rebuild` 为 `true` 当且仅当变更集中包含至少一个 rebuild 类文件。

### Decision 5: 事件名称保持 `app:reconciled` 不变

**选择**: 热导出完成后仍 emit `app:reconciled` 事件，不引入新事件名。

**备选方案**: 新增 `app:hot-exported` 事件，保留 `app:reconciled` 仅用于 rebuild。

**理由**: 前端只关心"有新内容可以刷新"，不关心内容是通过热导出还是 rebuild 生效的。保持同一事件名可以完全复用现有前端逻辑，零修改。

### Decision 6: DraftReconciler 重命名为 DraftRebuilder

**选择**: 类名 `DraftReconciler` → `DraftRebuilder`，方法 `reconcile()` → `rebuild()`，文件名 `draft-reconciler.ts` → `draft-rebuilder.ts`。

**理由**: 语义对齐。reconcile 暗示"同步/协调所有内容"，rebuild 明确表达"重建 DB + 安装依赖"这一重操作。同时 MCP tool 名 `reconcile_app` → `rebuild_app` 与内部命名保持一致。

### Decision 7: rebuild 保留全量导出（含 UI 和 functions）

**选择**: `DraftRebuilder.rebuild()` 执行完整的全量构建，包括 migrations + seeds + package.json + bun install + `exportFunctionsFromDb` + `exportUiFromDb`。

**备选方案**: rebuild 去掉 UI/functions 导出，因为热路径已经处理过。

**理由**: rebuild 的语义就是"全量重建一切"，确保 draft 目录与 `app_files` 表完全一致。这提供了一个可靠的兜底机制——无论之前热导出是否出过问题，rebuild 都能将状态修正。全量导出的开销（< 10ms）相对于 DB 重建和 bun install 可以忽略不计。

### Decision 8: AppManager 需要 EventBus 依赖

**选择**: `AppManager` 构造函数新增可选的 `eventBus` 参数，用于在热导出后 emit 事件。

**理由**: 当前 `app:reconciled` 事件只在 `LocalBackend.reconcile()` 中 emit。热导出发生在 `AppManager` 层，需要在这里 emit。`eventBus` 设为可选以保持测试友好。

## Risks / Trade-offs

### Risk 1: 热导出后 functions 未重新验证

当前 reconcile 会对每个 function 执行 `import()` 验证导出是否合法。热路径跳过了这一步。

→ **缓解**: Runtime 在函数被调用时会自然报错，错误会记录到 `app_errors` 表，Agent 可通过 `get_app_errors` 查看。验证的价值是"提前发现"，但对于即时反馈的热路径来说，延迟验证是可接受的 trade-off。

### Risk 2: update_app 批量导出时短暂的不一致状态

如果 `updateApp()` 在全量导出 functions 的过程中（先 rmSync 再逐文件写入），runtime 恰好收到请求，可能读到不完整的 functions 目录。

→ **缓解**: 这与当前 reconcile 存在的问题完全一致（reconcile 也是先删后写）。如果未来需要解决，可以引入"写到临时目录再 rename"的原子切换——但这是独立优化，不在本次范围内。

### Risk 3: `app:reconciled` 事件频率增加

之前只在 reconcile 时触发一次，现在每次 `updateFile` 都会触发。如果 Agent 快速连续调用多次 `update_app_file`，浏览器会收到多次刷新通知。

→ **缓解**: 前端已有 React 的批量渲染机制，多次快速刷新不会造成问题。如果未来有性能问题，可以在前端加 debounce——但当前不需要。
