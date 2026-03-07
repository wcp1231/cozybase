## Why

当前 Agent 开发流程中，每次文件变更后都需要显式调用 `reconcile_app` 才能在浏览器中看到效果。但 reconcile 是一个重量级操作（重建 Draft DB、执行所有 migrations、bun install 等），而绝大多数编辑操作（修改 UI 页面、修改函数实现）根本不需要这些重操作——只需要把文件从 `app_files` 表导出到 draft 目录即可。这导致了不必要的延迟和多余的 tool 调用。

将文件更新拆分为"热导出"和"重建"两层，可以让 90%+ 的编辑操作获得即时反馈，同时减少 Agent 需要调用的 tool 数量，提升用户体验。

## What Changes

- `AppManager.updateFile()` 和 `updateApp()` 在写入 `app_files` 后，根据文件路径自动执行轻量级导出：
  - `ui/pages.json` → 直接写入 `draft/{app}/ui/pages.json`
  - `functions/*` → 直接写入 `draft/{app}/functions/` 对应文件
  - 导出完成后 emit `app:reconciled` 事件，触发浏览器自动刷新
- **BREAKING**: MCP tool `reconcile_app` 重命名为 `rebuild_app`，职责收窄为仅处理重量级操作：
  - 重建 Draft DB（执行 migrations + seeds）
  - 导出 `package.json` + `bun install`
  - 重新加载 `app.yaml` 配置（定时任务等）
  - 重启 Draft runtime
- `rebuild_app` 不再需要重复导出 UI 和 functions（因为 update 时已经导出过）
- `update_app` / `update_app_file` 的 tool description 更新，移除"需要在之后调用 reconcile_app"的提示
- `update_app_file` 返回值增加 `needs_rebuild: boolean` 字段，告知 Agent 是否需要调用 `rebuild_app`

## Capabilities

### New Capabilities

- `hot-file-export`: 文件更新时根据路径自动执行轻量级导出到 draft 目录，覆盖 UI 和 functions 的即时生效逻辑

### Modified Capabilities

- `draft-prepare`: reconcile 重命名为 rebuild，职责收窄，不再负责 UI/functions 导出
- `ai-app-creation-flow`: APP 创建后的自动 reconcile 调用改为 rebuild（语义变更，行为不变）

## Impact

- **MCP tool 接口**: `reconcile_app` → `rebuild_app`（**BREAKING**，Agent prompt 和 skill 文档需同步更新）
- **daemon 核心**: `DraftReconciler` 类拆分或重构，热导出逻辑移入 `AppManager`
- **file-export 模块**: 新增单文件导出函数（当前 `exportFunctionsFromDb` 是全量重建）
- **event-bus**: `app:reconciled` 事件的触发点从 reconcile handler 扩展到 updateFile/updateApp
- **Agent 文档**: workflow guide、SKILL.md、AGENTS.md 中的流程说明需更新
- **前端**: 无需修改（已通过 `session.reconciled` WebSocket 事件驱动刷新）
- **LocalBackend / RemoteBackend**: reconcile 方法重命名为 rebuild
