## ADDED Requirements

### Requirement: 单文件更新后自动热导出可即时生效的 Draft 文件

当 `update_app_file` 成功写入 `app_files` 表后，系统 SHALL 根据文件路径自动将可即时生效的文件导出到 `draft/{appSlug}` 目录。`ui/pages.json` SHALL 导出到 `draft/{appSlug}/ui/pages.json`，`functions/*` SHALL 导出到 `draft/{appSlug}/functions/` 下对应路径，且这些导出 MUST NOT 依赖显式调用 `rebuild_app`。

#### Scenario: 更新 UI 文件后 Draft 页面立即可读取新内容

- **WHEN** Agent 调用 `update_app_file` 更新 `ui/pages.json`
- **THEN** 系统 SHALL 将最新内容写入 `app_files` 表
- **AND** 系统 SHALL 将相同内容导出到 `draft/{appSlug}/ui/pages.json`
- **AND** Draft runtime SHALL 能在不执行 `rebuild_app` 的前提下读取到新页面定义

#### Scenario: 更新 function 文件后 Draft runtime 立即使用新实现

- **WHEN** Agent 调用 `update_app_file` 更新 `functions/hello.ts`
- **THEN** 系统 SHALL 将最新内容写入 `app_files` 表
- **AND** 系统 SHALL 将该文件导出到 `draft/{appSlug}/functions/hello.ts`
- **AND** 后续对该 function 的调用 SHALL 使用导出后的最新实现

### Requirement: 批量更新后 Draft functions 目录与数据库文件集保持一致

当 `update_app` 批量写入多个文件时，系统 SHALL 在提交后同步更新 Draft 目录中的热导出文件集。对于 `functions/` 目录，系统 SHALL 以全量重新导出的方式保证磁盘目录与 `app_files` 中当前存在的函数文件集合一致，以便删除文件的变更也能生效。

#### Scenario: 批量更新包含函数删除时旧文件从 Draft 目录移除

- **WHEN** Agent 调用 `update_app` 提交一组新的 APP 文件集合
- **AND** 新集合中已不再包含原先存在的 `functions/legacy.ts`
- **THEN** 系统 SHALL 按最新数据库内容重建 `draft/{appSlug}/functions/` 下的函数文件集合
- **AND** `draft/{appSlug}/functions/legacy.ts` SHALL 不再存在

#### Scenario: 批量更新 UI 文件后 Draft 页面目录同步刷新

- **WHEN** Agent 调用 `update_app`，其文件集合中包含新的 `ui/pages.json`
- **THEN** 系统 SHALL 将该文件导出到 `draft/{appSlug}/ui/pages.json`
- **AND** Draft runtime SHALL 读取到批量更新后的页面结构

### Requirement: 更新接口返回是否需要 rebuild 的判定结果

系统 SHALL 根据被更新文件的路径判断该次变更是否仍需显式执行 `rebuild_app`。当变更包含 `migrations/*`、`seeds/*`、`package.json` 或 `app.yaml` 时，结果 MUST 标记为需要 rebuild；当变更仅包含 `ui/pages.json` 或 `functions/*` 时，结果 MUST 标记为不需要 rebuild。`update_app_file` 的返回值 SHALL 包含 `needs_rebuild: boolean` 字段表达该判定结果。

#### Scenario: 仅更新热导出文件时返回无需 rebuild

- **WHEN** Agent 调用 `update_app_file` 更新 `functions/hello.ts`
- **THEN** 返回结果 SHALL 包含 `needs_rebuild: false`

#### Scenario: 更新 migration 文件时返回需要 rebuild

- **WHEN** Agent 调用 `update_app_file` 更新 `migrations/001_add_posts.sql`
- **THEN** 返回结果 SHALL 包含 `needs_rebuild: true`

### Requirement: 热导出完成后复用现有 reconciled 事件通知浏览器刷新

当系统完成一次成功的热导出后，系统 SHALL 继续发送 `app:reconciled` 事件，而不是引入新的前端刷新事件名，以便现有浏览器刷新链路保持不变。

#### Scenario: 单文件热导出后触发浏览器刷新通知

- **WHEN** `update_app_file` 成功导出 `ui/pages.json` 或任意 `functions/*` 文件
- **THEN** 系统 SHALL 发送 `app:reconciled` 事件
- **AND** 已订阅该事件的浏览器端 SHALL 能收到刷新通知
