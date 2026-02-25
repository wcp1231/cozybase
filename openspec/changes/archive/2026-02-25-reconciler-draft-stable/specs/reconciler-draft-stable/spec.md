## ADDED Requirements

### Requirement: Migration 文件格式与排序

系统 SHALL 使用纯 SQL 格式的 migration 文件管理数据库结构变更。Migration 文件存放在 `apps/{appName}/migrations/` 目录下。

文件命名规范：
- 数字前缀排序：`{NNN}_{描述}.sql`（如 `001_create_todos.sql`）
- 数字前缀 SHALL 为三位数，左补零
- 描述部分使用下划线分隔的小写英文
- 文件内容为纯 SQL，每个 migration 可包含多条 SQL 语句

Migration 文件 SHALL 按数字前缀的升序执行。

`down`（回滚）脚本为 optional，MVP 阶段不要求。

#### Scenario: 标准 migration 文件

- **WHEN** `apps/todo-app/migrations/` 目录下存在 `001_create_todos.sql` 和 `002_add_priority.sql`
- **THEN** 系统 SHALL 按 001 → 002 的顺序执行这些 migration 文件

#### Scenario: migration 文件命名校验

- **WHEN** migration 文件名不匹配 `{NNN}_{description}.sql` 格式
- **THEN** 系统 SHALL 报错并拒绝执行

#### Scenario: migration 版本号不连续

- **WHEN** migration 文件为 `001_x.sql` 和 `003_y.sql`（跳过 002）
- **THEN** 系统 SHALL 报警告但仍按数字顺序执行

### Requirement: Seed 数据加载

系统 SHALL 支持 `apps/{appName}/seeds/` 目录下的 seed 文件，用于 Draft 环境的测试数据加载。

支持两种格式：
- `.sql` — 纯 SQL INSERT 语句
- `.json` — JSON 数组格式，包含 `table` 和 `rows` 字段

Seed 文件 SHALL 在所有 migration 执行完成后加载。JSON 格式的 seed 文件 SHALL 自动转换为 INSERT 语句执行。

#### Scenario: SQL 格式 seed 加载

- **WHEN** `seeds/todos.sql` 包含 INSERT 语句
- **THEN** 系统 SHALL 在 migration 全部执行完成后执行该 SQL 文件

#### Scenario: JSON 格式 seed 加载

- **WHEN** `seeds/todos.json` 包含 `{"table": "todos", "rows": [{"title": "Test", "completed": 0}]}`
- **THEN** 系统 SHALL 将其转换为 `INSERT INTO todos (title, completed) VALUES ('Test', 0)` 并执行

#### Scenario: seed 目录不存在

- **WHEN** `apps/{appName}/seeds/` 目录不存在
- **THEN** 系统 SHALL 跳过 seed 加载，不报错

#### Scenario: seed 加载顺序

- **WHEN** 存在多个 seed 文件
- **THEN** 系统 SHALL 按文件名字母顺序加载

### Requirement: App 状态推导

系统 SHALL 根据 git status 和 app.yaml 动态推导每个 App 的状态，不使用单独的状态字段。

状态推导规则（按优先级排列）：
1. 若 `app.yaml` 中包含 `status: deleted` → App 状态为 **Deleted**
2. 若 `data/apps/{appName}/db.sqlite`（stable DB）不存在 且 `apps/{appName}/` 下有 unstaged changes → 状态为 **Draft only**
3. 若 stable DB 存在 且 `apps/{appName}/` 下无 unstaged changes → 状态为 **Stable**
4. 若 stable DB 存在 且 `apps/{appName}/` 下有 unstaged changes → 状态为 **Stable + Draft**

"unstaged changes" 的判定 SHALL 通过 `git status --porcelain apps/{appName}/` 命令，检测是否存在未暂存或未跟踪的文件。

#### Scenario: 全新 App（Draft only）

- **WHEN** Agent 创建了 `apps/new-app/app.yaml` 和 `apps/new-app/migrations/001_init.sql`，尚未 Publish
- **THEN** 系统 SHALL 推导该 App 状态为 **Draft only**

#### Scenario: 已发布 App（Stable）

- **WHEN** `apps/todo-app/` 下所有文件已 committed，且 `data/apps/todo-app/db.sqlite` 存在
- **THEN** 系统 SHALL 推导该 App 状态为 **Stable**

#### Scenario: 已发布 App 正在修改（Stable + Draft）

- **WHEN** Agent 修改了已 committed 的 `apps/todo-app/migrations/` 下新增了 `003_add_tags.sql`（unstaged）
- **THEN** 系统 SHALL 推导该 App 状态为 **Stable + Draft**

#### Scenario: 已删除 App（Deleted）

- **WHEN** `apps/todo-app/app.yaml` 中包含 `status: deleted`
- **THEN** 系统 SHALL 推导该 App 状态为 **Deleted**，无论其他条件如何

### Requirement: Draft Reconcile（开发流程）

系统 SHALL 提供 Draft Reconcile 功能，用于 AI Agent 在开发环境中迭代测试 schema 变更。

Draft Reconcile 流程（销毁重建策略）：
1. 删除 `draft/apps/{appName}/db.sqlite`（若存在）
2. 创建 `draft/apps/{appName}/` 目录（若不存在）
3. 创建新的空 SQLite 数据库，启用 WAL 模式和 foreign keys
4. 按顺序执行 `apps/{appName}/migrations/` 下所有 `.sql` 文件
5. 加载 `apps/{appName}/seeds/` 下所有 seed 文件
6. 返回执行结果（成功/失败 + 已执行的 migration 列表）

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

### Requirement: Verify 流程

系统 SHALL 提供 Verify 功能，用于验证 Draft 版本的 migration 能否安全地应用到 Stable 版本的数据库上。

Verify 流程：
1. 检测已 committed 的 migration 文件是否被修改（对比 git HEAD 版本与工作区版本），若发现修改 SHALL 立即报错
2. 复制 `data/apps/{appName}/db.sqlite` → 临时文件 `temp.sqlite`
3. 在 `temp.sqlite` 上按序执行新增的（未 committed 的）migration 文件
4. 返回验证结果：成功或失败，附带变更摘要（执行的 migration 列表、创建/修改的表、新增的列等）
5. 删除 `temp.sqlite`

Verify SHALL 通过 `POST /draft/apps/:appName/verify` 触发。

App 状态 MUST 为 **Stable + Draft** 才能执行 Verify。

#### Scenario: Verify 成功

- **WHEN** Agent 对 Stable + Draft 状态的 App 调用 Verify，新增的 migration 在真实数据上执行成功
- **THEN** 系统 SHALL 返回成功结果和变更摘要

#### Scenario: Verify 失败 — migration 执行错误

- **WHEN** 新增的 migration SQL 在 stable 数据上执行失败（如列名冲突、约束违反）
- **THEN** 系统 SHALL 返回失败结果、失败的 migration 文件名和错误详情

#### Scenario: Verify 失败 — 已 committed migration 被修改

- **WHEN** Agent 修改了已 committed 的 `001_create_todos.sql` 文件
- **THEN** 系统 SHALL 立即报错："Migration 001_create_todos.sql has been modified after commit. Already-published migrations are immutable. Please create a new migration to make changes."

#### Scenario: Draft only App 执行 Verify

- **WHEN** Agent 对状态为 **Draft only** 的 App 调用 Verify
- **THEN** 系统 SHALL 返回错误：该 App 没有 Stable 版本可供验证

### Requirement: Publish 流程

系统 SHALL 提供 Publish 功能，将 Draft 版本的变更正式发布到 Stable 版本。

Publish 流程：
1. 备份 `data/apps/{appName}/db.sqlite` → `data/apps/{appName}/db.sqlite.bak`（若 stable DB 存在）
2. 在 `data/apps/{appName}/db.sqlite` 上增量执行新增的 migration 文件（若为新 App 则创建后执行全部 migration）
3. 记录已执行的 migration 到 `_migrations` 表
4. 若 migration 执行失败 → 恢复备份，返回错误
5. 加载新版 functions（整体替换）
6. `git add apps/{appName}/ && git commit -m "publish: {appName} - {变更摘要}"`
7. 清理 `draft/apps/{appName}/db.sqlite`（删除 draft 数据库）
8. 返回发布结果

Publish SHALL 通过 `POST /draft/apps/:appName/publish` 触发。

App 状态 MUST 为 **Draft only** 或 **Stable + Draft** 才能执行 Publish。

#### Scenario: 已有 App 的 Publish

- **WHEN** Agent 对 Stable + Draft 状态的 App 调用 Publish
- **THEN** 系统 SHALL 备份 stable.sqlite，增量执行新 migration，更新 _migrations 表，git commit，清理 draft.sqlite

#### Scenario: 新 App 的首次 Publish

- **WHEN** Agent 对 Draft only 状态的 App 调用 Publish
- **THEN** 系统 SHALL 创建 `data/apps/{appName}/db.sqlite`，执行全部 migration，记录 _migrations，git commit，清理 draft.sqlite

#### Scenario: Publish 失败并回滚

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用备份文件恢复 stable.sqlite，返回错误信息，不执行 git commit

#### Scenario: Publish 后 App 状态变更

- **WHEN** Publish 成功完成后
- **THEN** App 状态 SHALL 变为 **Stable**（所有文件已 committed，无 unstaged changes）

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

Publish 时，系统 SHALL 通过对比 `_migrations` 表记录与 `migrations/` 目录下的文件列表，确定需要增量执行的 migration。

Draft 数据库 SHALL 不维护 `_migrations` 表（每次销毁重建）。

#### Scenario: 识别未执行的 migration

- **WHEN** `_migrations` 表记录 version 1 和 2，但 migrations/ 目录下有 001、002、003 三个文件
- **THEN** 系统 SHALL 识别 003 为未执行的 migration，仅执行 003

#### Scenario: 首次 Publish 时创建 _migrations 表

- **WHEN** 新 App 首次 Publish，stable.sqlite 为新创建的空库
- **THEN** 系统 SHALL 自动创建 `_migrations` 表，然后执行全部 migration 并记录

#### Scenario: migration 版本号与 _migrations 记录一致性

- **WHEN** `_migrations` 表中最大 version 为 2，但 migrations/ 目录下文件为 001 和 002
- **THEN** 系统 SHALL 判定无新 migration 需要执行

### Requirement: App Soft Delete

系统 SHALL 支持通过在 `app.yaml` 中标记 `status: deleted` 实现 App 的软删除。

软删除的 App：
- SHALL 不响应任何 Stable 或 Draft 的 HTTP 请求（返回 404）
- SHALL 不参与 reconcile、verify、publish 流程
- 数据文件（`data/apps/{appName}/`）SHALL 保留，不自动清理
- `status: deleted` 标记 SHALL 通过 git commit 记录

物理删除（清理文件和数据库）SHALL 通过单独的管理接口实现，不在本次 scope 内。

#### Scenario: 标记 App 为 deleted

- **WHEN** 在 `apps/todo-app/app.yaml` 中设置 `status: deleted` 并 commit
- **THEN** 系统 SHALL 将该 App 视为已删除，所有 `/stable/apps/todo-app/*` 和 `/draft/apps/todo-app/*` 请求返回 404

#### Scenario: Deleted App 的数据保留

- **WHEN** App 被标记为 deleted
- **THEN** `data/apps/todo-app/db.sqlite` 和 `draft/apps/todo-app/db.sqlite` SHALL 保留，不自动删除

### Requirement: HTTP API 路由分离

系统 SHALL 将 HTTP API 拆分为 Stable 和 Draft 两套路由前缀，分别服务不同版本的 App。

路由结构：
- `/stable/apps/:appName/db/*` — Stable 版本的数据库 CRUD 操作
- `/stable/apps/:appName/functions/:name` — Stable 版本的 function 调用
- `/draft/apps/:appName/db/*` — Draft 版本的数据库 CRUD 操作
- `/draft/apps/:appName/functions/:name` — Draft 版本的 function 调用
- `POST /draft/apps/:appName/reconcile` — Draft Reconcile
- `POST /draft/apps/:appName/verify` — Verify
- `POST /draft/apps/:appName/publish` — Publish

Stable 路由 SHALL 连接 `data/apps/{appName}/db.sqlite`。
Draft 路由 SHALL 连接 `draft/apps/{appName}/db.sqlite`。

#### Scenario: Stable 路由访问

- **WHEN** 发送 `GET /stable/apps/todo-app/db/todos`
- **THEN** 系统 SHALL 从 `data/apps/todo-app/db.sqlite` 查询 todos 表数据

#### Scenario: Draft 路由访问

- **WHEN** 发送 `GET /draft/apps/todo-app/db/todos`
- **THEN** 系统 SHALL 从 `draft/apps/todo-app/db.sqlite` 查询 todos 表数据

#### Scenario: 访问不存在的 Stable 版本

- **WHEN** 发送 `GET /stable/apps/new-app/db/todos`，但 new-app 处于 Draft only 状态
- **THEN** 系统 SHALL 返回 404

#### Scenario: 访问 Deleted App

- **WHEN** 发送任何请求到 `/stable/apps/deleted-app/*` 或 `/draft/apps/deleted-app/*`
- **THEN** 系统 SHALL 返回 404

### Requirement: Stable 数据库备份

系统 SHALL 在 Publish 执行 migration 前自动备份 Stable 数据库，确保 migration 失败时可恢复。

备份策略：
- 备份路径：`data/apps/{appName}/db.sqlite.bak`
- 每次 Publish 前覆盖上一次备份
- migration 执行失败时自动恢复备份
- migration 执行成功后备份保留（不自动删除）

#### Scenario: Publish 前自动备份

- **WHEN** 执行 Publish 流程
- **THEN** 系统 SHALL 在执行 migration 前将 `db.sqlite` 复制为 `db.sqlite.bak`

#### Scenario: migration 失败自动恢复

- **WHEN** Publish 过程中 migration 执行失败
- **THEN** 系统 SHALL 用 `db.sqlite.bak` 覆盖 `db.sqlite`，恢复到 Publish 前的状态

#### Scenario: 新 App 无需备份

- **WHEN** Draft only 状态的 App 首次 Publish（stable.sqlite 不存在）
- **THEN** 系统 SHALL 跳过备份步骤，直接创建新的 stable.sqlite

### Requirement: 已 Committed Migration 不可变

系统 SHALL 禁止修改已通过 git commit 发布到 Stable 的 migration 文件。

Verify 阶段 SHALL 对比每个已 committed 的 migration 文件在 git HEAD 中的版本与工作区版本，若发现差异 SHALL 立即报错并终止 Verify。

需要对已有数据库结构进行变更时，MUST 创建新的 migration 文件。

#### Scenario: 检测到已 committed migration 被修改

- **WHEN** Verify 时发现 `001_create_todos.sql` 的工作区版本与 git HEAD 版本不一致
- **THEN** 系统 SHALL 报错："Migration 001_create_todos.sql has been modified after commit. Already-published migrations are immutable. Please create a new migration to make changes."

#### Scenario: 已 committed migration 未修改

- **WHEN** Verify 时所有已 committed 的 migration 文件与 git HEAD 版本一致
- **THEN** 系统 SHALL 继续执行后续验证步骤
