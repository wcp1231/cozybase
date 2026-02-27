## MODIFIED Requirements

### Requirement: Draft Reconcile（开发流程）

系统 SHALL 提供 Draft Reconcile 功能，用于 AI Agent 在开发环境中迭代测试 schema 变更。

Draft Reconcile 流程（销毁重建策略）：
1. 从 `app_files` 表查询该 APP 的 migration 记录（`WHERE path LIKE 'migrations/%' ORDER BY path`）
2. 从 `app_files` 表查询该 APP 的 seed 记录（`WHERE path LIKE 'seeds/%' ORDER BY path`）
3. 从 `app_files` 表查询该 APP 的 function 记录（`WHERE path LIKE 'functions/%'`）
4. 删除 `draft/{appName}/db.sqlite`（若存在）
5. 创建 `draft/{appName}/` 目录（若不存在）
6. 创建新的空 SQLite 数据库，启用 WAL 模式和 foreign keys
7. 使用 `MigrationRunner.fromDbRecords(records)` 构建 migration 列表，按顺序执行
8. 使用 `SeedLoader.loadSeedsFromRecords(db, records)` 加载 seed 数据
9. 将 function 文件从 DB 导出到 `draft/{appName}/functions/`（先清空目标目录再写入）
10. 验证 `draft/{appName}/functions/` 下所有 `.ts` 文件
11. 若 `app_files` 中存在 `package.json` 记录：导出到 `draft/{appName}/package.json`，然后在 `draft/{appName}/` 目录运行 `bun install`
12. 将 `ui/pages.json` 从 `app_files` 导出到 `draft/{appName}/ui/pages.json`（非阻塞）
13. 返回执行结果（成功/失败 + 已执行的 migration 列表 + 函数验证结果 + UI 导出结果 + npm 安装结果）

Function 导出逻辑：
- 若目标目录 `draft/{appName}/functions/` 已存在，SHALL 先删除再重新创建
- 从 `app_files` 查询 `WHERE path LIKE 'functions/%'` 的记录，将 `content` 写入对应文件
- 若无 function 记录，SHALL 跳过导出步骤，不报错

函数验证步骤 SHALL 从 `draft/{appName}/functions/` 目录读取文件进行验证，确保验证的是导出后的副本。

`bun install` 失败 SHALL 不阻断 reconcile 流程，在返回结果中记录警告。

Draft Reconcile SHALL 通过 `POST /draft/apps/:appName/reconcile` 触发。

APP 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Draft Reconcile。

返回结果类型：
```typescript
interface DraftReconcileResult {
  success: boolean;
  migrations: string[];
  seeds: string[];
  functions?: {
    validated: string[];
    warnings: FunctionValidationResult[];
  };
  ui?: { exported: boolean };
  npm?: { installed: boolean; warning?: string };
  error?: string;
}
```

#### Scenario: 正常 Draft Reconcile（含 package.json 和 UI 导出）

- **WHEN** Agent 调用 `POST /draft/apps/todo-app/reconcile`，`app_files` 中有 3 个 migration 记录、1 个 seed 记录、`package.json` 和 `ui/pages.json`
- **THEN** 系统 SHALL 销毁旧的 `draft/todo-app/db.sqlite`，创建新库，按序执行 3 个 migration，加载 seed，导出 function 文件并验证，导出 `package.json` 并在 `draft/todo-app/` 运行 `bun install`，导出 `ui/pages.json` 到 `draft/todo-app/ui/pages.json`，返回成功结果

#### Scenario: bun install 失败不阻断 reconcile

- **WHEN** reconcile 时 `bun install` 因网络问题失败
- **THEN** reconcile 整体结果 SHALL 仍为成功，返回结果含 `npm: { installed: false, warning: "..." }`，migration 和函数导出结果不受影响

#### Scenario: 重复 Reconcile 清理旧函数副本

- **WHEN** Agent 连续两次调用 Reconcile，第一次时有 `functions/orders.ts`，第二次时该记录被删除
- **THEN** 第二次 Reconcile SHALL 先清空 `draft/{appName}/functions/` 目录再导出，确保不残留已删除的函数文件

#### Scenario: 无 package.json 时跳过 bun install

- **WHEN** `app_files` 中不存在该 APP 的 `package.json` 记录
- **THEN** 系统 SHALL 跳过 `package.json` 导出和 `bun install` 步骤，reconcile 正常完成

### Requirement: Publish 流程

系统 SHALL 提供 Publish 功能，将 Draft 版本的变更正式发布到 Stable 版本。

Publish 流程：
1. 备份 `stable/{appName}/db.sqlite` → `stable/{appName}/db.sqlite.bak`（若 stable DB 存在）
2. 从 `app_files` 表查询 migration 记录
3. 在 `stable/{appName}/db.sqlite` 上增量执行新增的 migration 文件（若为新 APP 则创建后执行全部 migration）
4. 记录已执行的 migration 到 `_migrations` 表
5. 若 migration 执行失败 → 恢复备份，返回错误
6. 将已执行的 migration 在 `app_files` 中标记为 `immutable = 1`
7. 更新 `apps.published_version = current_version`
8. 将 function 文件从 DB 导出到 `stable/{appName}/functions/`（先清空再写入）
9. 通知 FunctionRuntime 重新加载该 APP 的函数模块缓存
10. 若 `app_files` 中存在 `package.json` 记录：导出到 `stable/{appName}/package.json`，然后在 `stable/{appName}/` 目录运行 `bun install`
11. 将 `ui/pages.json` 从 `app_files` 导出到 `stable/{appName}/ui/pages.json`（非阻塞）
12. 清理 `draft/{appName}/db.sqlite`（删除 draft 数据库）
13. 清理 `draft/{appName}/ui/` 目录（best-effort）
14. 返回发布结果

`bun install` 失败 SHALL 不阻断 publish 流程，在返回结果中记录警告。

Publish SHALL 通过 `POST /draft/apps/:appName/publish` 触发。

APP 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Publish。

返回结果类型：
```typescript
interface PublishResult {
  success: boolean;
  migrationsApplied: string[];
  ui?: { exported: boolean };
  npm?: { installed: boolean; warning?: string };
  error?: string;
}
```

#### Scenario: 新 APP 首次 Publish（含 package.json）

- **WHEN** Agent 对 Draft only 状态的 APP 调用 Publish，`app_files` 中含 `package.json` 和 `ui/pages.json`
- **THEN** 系统 SHALL 创建 `stable/{appName}/db.sqlite`，执行全部 migration，记录 `_migrations`，标记 migration 为 immutable，设置 `published_version = current_version`，导出 function 文件，导出 `package.json` 并在 `stable/{appName}/` 运行 `bun install`，导出 `ui/pages.json`，清理 draft 数据库和 draft UI 目录

#### Scenario: 已有 APP 的 Publish

- **WHEN** Agent 对 Stable + Draft 状态的 APP 调用 Publish
- **THEN** 系统 SHALL 备份 `stable/{appName}/db.sqlite`，增量执行新 migration，更新状态并导出文件，install 依赖，清理 draft 资源

#### Scenario: Publish 失败并回滚

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用 `stable/{appName}/db.sqlite.bak` 恢复 `stable/{appName}/db.sqlite`，返回错误，不更新 `published_version`，不导出 functions 和 UI，不运行 `bun install`，不清理 draft 资源

#### Scenario: bun install 失败不阻断 publish

- **WHEN** publish 时 `bun install` 因网络问题失败
- **THEN** publish 整体结果 SHALL 仍为成功，返回结果含 `npm: { installed: false, warning: "..." }`，migration、函数导出结果不受影响

### Requirement: Verify 流程

系统 SHALL 提供 Verify 功能，用于验证 Draft 版本的 migration 能否安全地应用到 Stable 版本的数据库上。

Verify 流程：
1. 检查 `app_files` 中 `immutable = 1` 的 migration 文件的一致性，若发现异常 SHALL 立即报错
2. 复制 `stable/{appName}/db.sqlite` → 临时文件 `stable/{appName}/db.sqlite.verify_tmp`
3. 从 `app_files` 表查询 migration 记录，识别新增的（`_migrations` 表中不存在的）migration
4. 在临时文件上按序执行新增的 migration 文件
5. 返回验证结果：成功或失败，附带变更摘要
6. 删除临时文件

Verify SHALL 通过 `POST /draft/apps/:appName/verify` 触发。

APP 状态 MUST 为 **Stable + Draft** 才能执行 Verify。

#### Scenario: Verify 成功

- **WHEN** Agent 对 Stable + Draft 状态的 APP 调用 Verify，新增的 migration 在数据副本上执行成功
- **THEN** 系统 SHALL 返回成功结果和变更摘要，删除临时验证文件

#### Scenario: Verify 失败 — migration 执行错误

- **WHEN** 新增的 migration SQL 在 stable 数据副本上执行失败
- **THEN** 系统 SHALL 返回失败结果、失败的 migration 文件名和错误详情，删除临时验证文件

### Requirement: Stable 数据库备份

系统 SHALL 在 Publish 执行 migration 前自动备份 Stable 数据库，确保 migration 失败时可恢复。

备份路径：`stable/{appName}/db.sqlite.bak`

每次 Publish 前覆盖上一次备份。migration 执行失败时自动恢复备份。migration 执行成功后备份保留（不自动删除）。

#### Scenario: Publish 前自动备份

- **WHEN** 执行 Publish 流程且 `stable/{appName}/db.sqlite` 已存在
- **THEN** 系统 SHALL 在执行 migration 前将其复制为 `stable/{appName}/db.sqlite.bak`

#### Scenario: migration 失败自动恢复

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用 `stable/{appName}/db.sqlite.bak` 覆盖 `stable/{appName}/db.sqlite`

#### Scenario: 新 APP 无需备份

- **WHEN** Draft only 状态的 APP 首次 Publish（`stable/{appName}/db.sqlite` 不存在）
- **THEN** 系统 SHALL 跳过备份步骤，直接创建新的 `stable/{appName}/db.sqlite`

### Requirement: HTTP API 路由分离

系统 SHALL 将 Runtime 对外路由拆分为 Stable 和 Draft 两套路由前缀。Stable 路由连接 `stable/{appName}/db.sqlite`，Draft 路由连接 `draft/{appName}/db.sqlite`。

管理端点：
- `POST /draft/apps/:appName/reconcile` — Draft Reconcile
- `POST /draft/apps/:appName/verify` — Verify
- `POST /draft/apps/:appName/publish` — Publish

#### Scenario: Stable 路由访问

- **WHEN** 发送 `GET /stable/apps/todo-app/db/todos`
- **THEN** 系统 SHALL 从 `stable/todo-app/db.sqlite` 查询 todos 表数据

#### Scenario: Draft 路由访问

- **WHEN** 发送 `GET /draft/apps/todo-app/db/todos`
- **THEN** 系统 SHALL 从 `draft/todo-app/db.sqlite` 查询 todos 表数据

#### Scenario: 访问不存在的 Stable 版本

- **WHEN** 发送 `GET /stable/apps/new-app/db/todos`，但 new-app 处于 Draft only 状态
- **THEN** 系统 SHALL 返回 404
