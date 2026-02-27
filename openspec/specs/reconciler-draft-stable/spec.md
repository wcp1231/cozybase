# Reconciler Draft-Stable

## Purpose

Manage the Draft-Stable reconciliation lifecycle for apps, including migration execution, seed loading, function validation, verify, publish, and state management. All app definition data is sourced from Platform DB (`app_files` table) rather than the filesystem.
## Requirements
### Requirement: Migration 文件格式与排序

系统 SHALL 使用纯 SQL 格式的 migration 文件管理数据库结构变更。Migration 文件存储在 Platform DB 的 `app_files` 表中，`path` 以 `migrations/` 开头。

文件命名规范（`path` 中 `migrations/` 之后的部分）：
- 数字前缀排序：`{NNN}_{描述}.sql`（如 `migrations/001_create_todos.sql`）
- 数字前缀 SHALL 为三位数，左补零
- 描述部分使用下划线分隔的小写英文
- `content` 字段为纯 SQL，每个 migration 可包含多条 SQL 语句

Migration 文件 SHALL 按 `path` 的升序（即数字前缀升序）执行。

MigrationRunner SHALL 提供 `fromDbRecords(records)` 静态方法，从 `app_files` 查询结果（`{ path, content }`）解析出 `version`、`name`、`filename`、`sql`。复用现有的 `MIGRATION_PATTERN` 正则。

原有的 `scanMigrations(dir)` 方法 SHALL 保留但仅用于 filesystem 迁移场景。

`down`（回滚）脚本为 optional，MVP 阶段不要求。

#### Scenario: 从 DB 加载 migration

- **WHEN** 查询 `app_files` 表得到 `[{path: "migrations/001_create_todos.sql", content: "CREATE TABLE..."}, {path: "migrations/002_add_priority.sql", content: "ALTER TABLE..."}]`
- **THEN** `MigrationRunner.fromDbRecords()` SHALL 返回按 version 排序的 MigrationFile 列表，version 分别为 1 和 2

#### Scenario: migration 文件命名校验

- **WHEN** `app_files` 中存在 `path` 为 `migrations/invalid_name.sql`（不匹配 `{NNN}_{description}.sql` 格式）
- **THEN** 系统 SHALL 报错并拒绝执行

#### Scenario: migration 版本号不连续

- **WHEN** `app_files` 中 migration 为 `001_x.sql` 和 `003_y.sql`（跳过 002）
- **THEN** 系统 SHALL 报警告但仍按数字顺序执行

### Requirement: Seed 数据加载

系统 SHALL 支持从 `app_files` 表中加载 seed 数据，用于 Draft 环境的测试数据加载。`path` 以 `seeds/` 开头的记录为 seed 文件。

支持两种格式（根据 `path` 后缀判断）：
- `.sql` — 纯 SQL INSERT 语句
- `.json` — JSON 数组格式，包含 `table` 和 `rows` 字段

Seed 文件 SHALL 在所有 migration 执行完成后加载。JSON 格式的 seed 文件 SHALL 自动转换为 INSERT 语句执行。

SeedLoader SHALL 提供 `loadSeedsFromRecords(db, records)` 方法，从 `app_files` 查询结果直接加载 seed，不依赖文件系统。

#### Scenario: 从 DB 加载 SQL 格式 seed

- **WHEN** `app_files` 中存在 `{path: "seeds/todos.sql", content: "INSERT INTO todos..."}`
- **THEN** 系统 SHALL 在 migration 全部执行完成后执行该 SQL 内容

#### Scenario: 从 DB 加载 JSON 格式 seed

- **WHEN** `app_files` 中存在 `{path: "seeds/todos.json", content: "{\"table\": \"todos\", \"rows\": [{\"title\": \"Test\", \"completed\": 0}]}"}`
- **THEN** 系统 SHALL 将其转换为 `INSERT INTO todos (title, completed) VALUES ('Test', 0)` 并执行

#### Scenario: 无 seed 记录

- **WHEN** `app_files` 中不存在该 App 的 `seeds/*` 记录
- **THEN** 系统 SHALL 跳过 seed 加载，不报错

#### Scenario: seed 加载顺序

- **WHEN** 存在多个 seed 记录
- **THEN** 系统 SHALL 按 `path` 字母顺序加载

### Requirement: App 状态推导

系统 SHALL 根据 `apps` 表中的 `status`、`published_version`、`current_version` 字段推导每个 App 的状态，不依赖 Git 或文件系统。

状态推导规则（按优先级排列）：
1. 若 `apps.status = 'deleted'` → App 状态为 **Deleted**
2. 若 `published_version = 0`（从未 publish）→ 状态为 **Draft only**
3. 若 `published_version > 0` 且 `current_version = published_version` → 状态为 **Stable**
4. 若 `published_version > 0` 且 `current_version > published_version` → 状态为 **Stable + Draft**

不再需要 `hasUnstagedChanges()` 方法和任何 Git 调用。

#### Scenario: 全新 App（Draft only）

- **WHEN** Agent 创建了 App，`current_version = 1`，`published_version = 0`
- **THEN** 系统 SHALL 推导该 App 状态为 **Draft only**

#### Scenario: 已发布 App（Stable）

- **WHEN** App 的 `published_version = 2` 且 `current_version = 2`
- **THEN** 系统 SHALL 推导该 App 状态为 **Stable**

#### Scenario: 已发布 App 正在修改（Stable + Draft）

- **WHEN** App 的 `published_version = 2` 且 `current_version = 3`
- **THEN** 系统 SHALL 推导该 App 状态为 **Stable + Draft**

#### Scenario: 已删除 App（Deleted）

- **WHEN** `apps.status = 'deleted'`
- **THEN** 系统 SHALL 推导该 App 状态为 **Deleted**，无论 version 字段如何

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

### Requirement: Stable 数据库 Migration 追踪

系统 SHALL 在每个 App 的 Stable SQLite 数据库中维护 `_migrations` 表，记录已执行的 migration。

表结构：
```sql
CREATE TABLE _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Publish 时，系统 SHALL 通过对比 `_migrations` 表记录与 `app_files` 中的 migration 记录列表，确定需要增量执行的 migration。

Draft 数据库 SHALL 不维护 `_migrations` 表（每次销毁重建）。

#### Scenario: 识别未执行的 migration

- **WHEN** `_migrations` 表记录 version 1 和 2，但 `app_files` 中有 migrations/001、002、003 三条记录
- **THEN** 系统 SHALL 识别 003 为未执行的 migration，仅执行 003

#### Scenario: 首次 Publish 时创建 _migrations 表

- **WHEN** 新 App 首次 Publish，stable.sqlite 为新创建的空库
- **THEN** 系统 SHALL 自动创建 `_migrations` 表，然后执行全部 migration 并记录

#### Scenario: migration 版本号与 _migrations 记录一致性

- **WHEN** `_migrations` 表中最大 version 为 2，但 `app_files` 中 migration 记录为 001 和 002
- **THEN** 系统 SHALL 判定无新 migration 需要执行

### Requirement: App Soft Delete

系统 SHALL 支持通过 `apps.status = 'deleted'` 实现 App 的软删除。

软删除的 App：
- SHALL 不响应任何 Stable 或 Draft 的 HTTP 请求（返回 404）
- SHALL 不参与 reconcile、verify、publish 流程
- 数据文件（`data/apps/{appName}/`）SHALL 保留，不自动清理
- `app_files` 记录 SHALL 保留，不自动清理

物理删除（清理数据库记录和文件）SHALL 通过 Management API 的 `DELETE /api/v1/apps/:name` 实现。

#### Scenario: 标记 App 为 deleted

- **WHEN** `apps` 表中该 App 的 `status` 被设为 `'deleted'`
- **THEN** 系统 SHALL 将该 App 视为已删除，所有 `/stable/apps/{appName}/*` 和 `/draft/apps/{appName}/*` 请求返回 404

#### Scenario: Deleted App 的数据保留

- **WHEN** App 被标记为 deleted
- **THEN** `data/apps/{appName}/` 目录和 `app_files` 记录 SHALL 保留，不自动删除

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

### Requirement: 已 Publish Migration 不可变

系统 SHALL 禁止修改 `app_files` 中 `immutable = 1` 的 migration 文件。

不可变保护在两层实现：
1. **API 层**：Management API 的 `update_app` 和 `update_app_file` SHALL 拒绝修改 `immutable = 1` 的文件（返回 400 错误）
2. **Verify 层**：Verify 阶段 SHALL 检查所有已执行的 migration 在 `app_files` 中是否存在且标记为 `immutable`，若发现异常 SHALL 报错

Publish 时 SHALL 将本次执行的 migration 标记为 `immutable = 1`。

需要对已有数据库结构进行变更时，MUST 创建新的 migration 文件。

#### Scenario: API 拒绝修改 immutable 文件

- **WHEN** 通过 `update_app` 或 `update_app_file` 尝试修改 `immutable = 1` 的 `migrations/001_create_todos.sql`
- **THEN** 系统 SHALL 返回 400 错误："Migration migrations/001_create_todos.sql is immutable and cannot be modified."

#### Scenario: Verify 检查 immutable 一致性

- **WHEN** Verify 时发现 `_migrations` 表中已执行的 version 对应的 `app_files` 记录未标记为 `immutable`
- **THEN** 系统 SHALL 报错提示数据完整性问题

#### Scenario: Publish 标记 immutable

- **WHEN** Publish 成功执行了 migration 003
- **THEN** 系统 SHALL 将 `app_files` 中对应的 `migrations/003_*.sql` 记录的 `immutable` 设为 1

