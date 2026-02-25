## MODIFIED Requirements

### Requirement: Draft Reconcile（开发流程）

系统 SHALL 提供 Draft Reconcile 功能，用于 AI Agent 在开发环境中迭代测试 schema 变更。

Draft Reconcile 流程（销毁重建策略）：
1. 删除 `draft/apps/{appName}/db.sqlite`（若存在）
2. 创建 `draft/apps/{appName}/` 目录（若不存在）
3. 创建新的空 SQLite 数据库，启用 WAL 模式和 foreign keys
4. 按顺序执行 `apps/{appName}/migrations/` 下所有 `.sql` 文件
5. 加载 `apps/{appName}/seeds/` 下所有 seed 文件
6. 验证 `apps/{appName}/functions/` 下所有 `.ts` 文件（可选步骤，失败不阻塞 Reconcile）
7. 返回执行结果（成功/失败 + 已执行的 migration 列表 + 函数验证结果）

函数验证步骤 SHALL 检查：
- 文件能否被 Bun `import()` 成功（无语法错误）
- 文件是否包含 `export default` 或至少一个 HTTP method 命名导出（`GET`、`POST` 等）

函数验证失败 SHALL 不阻塞 Reconcile 流程，但 SHALL 在返回结果中报告警告信息。

Draft Reconcile SHALL 通过 `POST /draft/apps/:appName/reconcile` 触发。

App 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Draft Reconcile。

#### Scenario: 正常 Draft Reconcile

- **WHEN** Agent 调用 `POST /draft/apps/todo-app/reconcile`，migrations 目录下有 3 个 migration 文件和 1 个 seed 文件
- **THEN** 系统 SHALL 销毁旧的 draft.sqlite，创建新库，按序执行 3 个 migration，加载 seed，返回成功结果

#### Scenario: Draft Reconcile 失败

- **WHEN** migration SQL 语法错误或执行失败
- **THEN** 系统 SHALL 返回错误信息，包含失败的 migration 文件名和错误详情。draft.sqlite 状态不保证一致（下次 reconcile 时会销毁重建）

#### Scenario: 无 migration 文件

- **WHEN** `apps/{appName}/migrations/` 目录为空或不存在
- **THEN** 系统 SHALL 创建空的 draft.sqlite（仅含系统表），不报错

#### Scenario: 针对 Stable 状态的 App 执行 Draft Reconcile

- **WHEN** Agent 对状态为 **Stable** 的 App 调用 Draft Reconcile
- **THEN** 系统 SHALL 返回错误：该 App 没有 draft 变更

#### Scenario: 函数验证通过

- **WHEN** Draft Reconcile 时 `functions/` 下所有 `.ts` 文件语法正确且包含有效导出
- **THEN** 系统 SHALL 在返回结果中报告函数验证成功，包含已验证的函数列表

#### Scenario: 函数验证失败但 Reconcile 继续

- **WHEN** Draft Reconcile 时 `functions/orders.ts` 存在语法错误
- **THEN** 系统 SHALL 继续完成 migration 和 seed 加载，在返回结果中以警告形式报告函数验证错误（包含文件名和错误信息），Reconcile 整体仍为成功

#### Scenario: 无函数文件

- **WHEN** `apps/{appName}/functions/` 目录为空或不存在
- **THEN** 系统 SHALL 跳过函数验证步骤，不报错

### Requirement: Publish 流程

系统 SHALL 提供 Publish 功能，将 Draft 版本的变更正式发布到 Stable 版本。

Publish 流程：
1. 备份 `data/apps/{appName}/db.sqlite` → `data/apps/{appName}/db.sqlite.bak`（若 stable DB 存在）
2. 在 `data/apps/{appName}/db.sqlite` 上增量执行新增的 migration 文件（若为新 App 则创建后执行全部 migration）
3. 记录已执行的 migration 到 `_migrations` 表
4. 若 migration 执行失败 → 恢复备份，返回错误
5. 通知 FunctionRuntime 重新加载该 APP 的函数模块缓存（调用 `FunctionRuntime.reload(appName)`）
6. `git add apps/{appName}/ && git commit -m "publish: {appName} - {变更摘要}"`（`apps/{appName}/` 包含 `migrations/`、`seeds/`、`functions/` 等所有声明文件）
7. 清理 `draft/apps/{appName}/db.sqlite`（删除 draft 数据库）
8. 返回发布结果

Publish SHALL 通过 `POST /draft/apps/:appName/publish` 触发。

App 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Publish。

#### Scenario: 已有 App 的 Publish

- **WHEN** Agent 对 Stable + Draft 状态的 App 调用 Publish
- **THEN** 系统 SHALL 备份 stable.sqlite，增量执行新 migration，更新 _migrations 表，通知 FunctionRuntime reload，git commit，清理 draft.sqlite

#### Scenario: 新 App 的首次 Publish

- **WHEN** Agent 对 Draft only 状态的 App 调用 Publish
- **THEN** 系统 SHALL 创建 `data/apps/{appName}/db.sqlite`，执行全部 migration，记录 _migrations，通知 FunctionRuntime reload，git commit，清理 draft.sqlite

#### Scenario: Publish 失败并回滚

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用备份文件恢复 stable.sqlite，返回错误信息，不执行 git commit，不通知 FunctionRuntime reload

#### Scenario: Publish 后 App 状态变更

- **WHEN** Publish 成功完成后
- **THEN** App 状态 SHALL 变为 **Stable**（所有文件已 committed，无 unstaged changes）

#### Scenario: Publish 包含函数文件变更

- **WHEN** Agent 新增了 `functions/create-order.ts` 并调用 Publish
- **THEN** `git add apps/{appName}/` SHALL 将 `functions/create-order.ts` 纳入 commit，FunctionRuntime SHALL 重新加载使新函数在 Stable 模式下可用
