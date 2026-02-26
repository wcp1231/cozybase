## MODIFIED Requirements

### Requirement: Draft Reconcile（开发流程）

系统 SHALL 提供 Draft Reconcile 功能，用于 AI Agent 在开发环境中迭代测试 schema 变更。

Draft Reconcile 流程（销毁重建策略）：
1. 从 `app_files` 表查询该 App 的 migration 记录（`WHERE path LIKE 'migrations/%' ORDER BY path`）
2. 从 `app_files` 表查询该 App 的 seed 记录（`WHERE path LIKE 'seeds/%' ORDER BY path`）
3. 从 `app_files` 表查询该 App 的 function 记录（`WHERE path LIKE 'functions/%'`）
4. 删除 `draft/apps/{appName}/db.sqlite`（若存在）
5. 创建 `draft/apps/{appName}/` 目录（若不存在）
6. 创建新的空 SQLite 数据库，启用 WAL 模式和 foreign keys
7. 使用 `MigrationRunner.fromDbRecords(records)` 构建 migration 列表，按顺序执行
8. 使用 `SeedLoader.loadSeedsFromRecords(db, records)` 加载 seed 数据
9. 将 function 文件从 DB 导出到 `draft/apps/{appName}/functions/`（先清空目标目录再写入）
10. 验证 `draft/apps/{appName}/functions/` 下所有 `.ts` 文件（从 draft 目录验证）
11. **将 `ui/pages.json` 从 `app_files` 导出到 `draft/apps/{appName}/ui/pages.json`（非阻塞）**
12. 返回执行结果（成功/失败 + 已执行的 migration 列表 + 函数验证结果 + **UI 导出结果**）

Function 导出逻辑：
- 若目标目录 `draft/apps/{appName}/functions/` 已存在，SHALL 先删除再重新创建
- 从 `app_files` 查询 `WHERE path LIKE 'functions/%'` 的记录，将 `content` 写入对应文件
- 若无 function 记录，SHALL 跳过导出步骤，不报错

函数验证步骤 SHALL 从 `draft/apps/{appName}/functions/` 目录读取文件进行验证，确保验证的是导出后的副本。

函数验证步骤 SHALL 检查：
- 文件能否被 Bun `import()` 成功（无语法错误）
- 文件是否包含 `export default` 或至少一个 HTTP method 命名导出（`GET`、`POST` 等）

函数验证失败 SHALL 不阻塞 Reconcile 流程，但 SHALL 在返回结果中报告警告信息。

Draft Reconcile SHALL 通过 `POST /draft/apps/:appName/reconcile` 触发。

App 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Draft Reconcile。

返回结果类型扩展：
```typescript
interface DraftReconcileResult {
  success: boolean;
  migrations: string[];
  seeds: string[];
  functions?: {
    validated: string[];
    warnings: FunctionValidationResult[];
  };
  ui?: { exported: boolean };  // 新增
  error?: string;
}
```

#### Scenario: 正常 Draft Reconcile（含 UI 导出）

- **WHEN** Agent 调用 `POST /draft/apps/todo-app/reconcile`，`app_files` 中有 3 个 migration 记录、1 个 seed 记录和 `ui/pages.json`
- **THEN** 系统 SHALL 销毁旧的 draft.sqlite，创建新库，按序执行 3 个 migration，加载 seed，导出 function 文件并验证，导出 `ui/pages.json` 到 `draft/apps/todo-app/ui/pages.json`，返回成功结果含 `ui: { exported: true }`

#### Scenario: Draft Reconcile 失败

- **WHEN** migration SQL 语法错误或执行失败
- **THEN** 系统 SHALL 返回错误信息，包含失败的 migration 文件名和错误详情。draft.sqlite 状态不保证一致（下次 reconcile 时会销毁重建）

#### Scenario: 无 migration 记录

- **WHEN** `app_files` 中不存在该 App 的 `migrations/*` 记录
- **THEN** 系统 SHALL 创建空的 draft.sqlite（仅含系统表），不报错

#### Scenario: 针对 Stable 状态的 App 执行 Draft Reconcile

- **WHEN** Agent 对状态为 **Stable** 的 App 调用 Draft Reconcile
- **THEN** 系统 SHALL 返回错误：该 App 没有 draft 变更

#### Scenario: 函数验证通过

- **WHEN** Draft Reconcile 时从 DB 导出的 function 文件语法正确且包含有效导出
- **THEN** 系统 SHALL 在返回结果中报告函数验证成功，包含已验证的函数列表

#### Scenario: 函数验证失败但 Reconcile 继续

- **WHEN** Draft Reconcile 时导出的 `functions/orders.ts` 存在语法错误
- **THEN** 系统 SHALL 继续完成 migration 和 seed 加载，在返回结果中以警告形式报告函数验证错误，Reconcile 整体仍为成功

#### Scenario: 无函数记录

- **WHEN** `app_files` 中不存在该 App 的 `functions/*` 记录
- **THEN** 系统 SHALL 跳过函数导出和验证步骤，不报错

#### Scenario: 重复 Reconcile 清理旧函数副本

- **WHEN** Agent 连续两次调用 Reconcile，第一次时有 `functions/orders.ts`，第二次时该记录被删除
- **THEN** 第二次 Reconcile SHALL 先清空 `draft/apps/{appName}/functions/` 目录再导出，确保不残留已删除的函数文件

#### Scenario: 无 UI 定义时的 Reconcile

- **WHEN** `app_files` 中不存在该 App 的 `ui/pages.json` 记录
- **THEN** 系统 SHALL 跳过 UI 导出步骤，返回结果不含 `ui` 字段，不报错

### Requirement: Publish 流程

系统 SHALL 提供 Publish 功能，将 Draft 版本的变更正式发布到 Stable 版本。

Publish 流程：
1. 备份 `data/apps/{appName}/db.sqlite` → `data/apps/{appName}/db.sqlite.bak`（若 stable DB 存在）
2. 从 `app_files` 表查询 migration 记录
3. 在 `data/apps/{appName}/db.sqlite` 上增量执行新增的 migration 文件（若为新 App 则创建后执行全部 migration）
4. 记录已执行的 migration 到 `_migrations` 表
5. 若 migration 执行失败 → 恢复备份，返回错误
6. 将已执行的 migration 在 `app_files` 中标记为 `immutable = 1`
7. 更新 `apps.published_version = current_version`
8. 将 function 文件从 DB 导出到 `data/apps/{appName}/functions/`（先清空再写入）
9. 通知 FunctionRuntime 重新加载该 APP 的函数模块缓存（调用 `FunctionRuntime.reload(appName)`）
10. **将 `ui/pages.json` 从 `app_files` 导出到 `data/apps/{appName}/ui/pages.json`（非阻塞）**
11. 清理 `draft/apps/{appName}/db.sqlite`（删除 draft 数据库）
12. **清理 `draft/apps/{appName}/ui/` 目录（best-effort）**
13. 返回发布结果

Publish SHALL 通过 `POST /draft/apps/:appName/publish` 触发。

App 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Publish。

返回结果类型扩展：
```typescript
interface PublishResult {
  success: boolean;
  migrationsApplied: string[];
  ui?: { exported: boolean };  // 新增
  error?: string;
}
```

#### Scenario: 已有 App 的 Publish（含 UI）

- **WHEN** Agent 对 Stable + Draft 状态的 App 调用 Publish，`app_files` 中含 `ui/pages.json`
- **THEN** 系统 SHALL 备份 stable.sqlite，增量执行新 migration，更新 _migrations 表，标记 migration 为 immutable，更新 published_version，导出 function 到 stable 目录，通知 FunctionRuntime reload，导出 `ui/pages.json` 到 `data/apps/{appName}/ui/pages.json`，清理 draft.sqlite 和 draft UI 文件

#### Scenario: 新 App 的首次 Publish（含 UI）

- **WHEN** Agent 对 Draft only 状态的 App 调用 Publish，`app_files` 中含 `ui/pages.json`
- **THEN** 系统 SHALL 创建 `data/apps/{appName}/db.sqlite`，执行全部 migration，记录 _migrations，标记 migration 为 immutable，设置 published_version = current_version，导出 function 文件，通知 FunctionRuntime reload，导出 `ui/pages.json` 到 stable 目录，清理 draft.sqlite 和 draft UI 文件

#### Scenario: Publish 失败并回滚

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用备份文件恢复 stable.sqlite，返回错误信息，不更新 published_version，不标记 immutable，不通知 FunctionRuntime reload，不导出 UI 到 stable，不清理 draft UI 文件

#### Scenario: Publish 后 App 状态变更

- **WHEN** Publish 成功完成后
- **THEN** App 状态 SHALL 变为 **Stable**（`published_version = current_version`）

#### Scenario: Publish 包含函数文件变更

- **WHEN** Agent 在 `app_files` 中新增了 `functions/create-order.ts` 记录并调用 Publish
- **THEN** 系统 SHALL 将该 function 文件导出到 `data/apps/{appName}/functions/create-order.ts`，FunctionRuntime SHALL 重新加载使新函数在 Stable 模式下可用

#### Scenario: Publish 无 UI 定义

- **WHEN** Agent 调用 Publish，`app_files` 中不存在 `ui/pages.json`
- **THEN** 系统 SHALL 跳过 UI 导出，返回结果不含 `ui` 字段，不影响其他 Publish 步骤
