## MODIFIED Requirements

### Requirement: Workspace 目录结构

系统 SHALL 使用以下固定的目录结构来组织 workspace：

- `workspace.yaml` — workspace 配置文件
- `apps/` — 应用声明目录（git tracked）
- `data/` — Stable 运行时数据目录（git ignored）
- `data/platform.sqlite` — 平台级数据库
- `data/apps/{appName}/` — 各 app 的 Stable 数据目录
- `draft/` — Draft 运行时数据目录（git ignored）
- `draft/apps/{appName}/` — 各 app 的 Draft 数据目录

`apps/`、`data/` 和 `draft/` 的相对路径 SHALL 为硬编码约定，不可通过配置修改。

#### Scenario: workspace 目录结构完整性

- **WHEN** workspace 初始化完成后
- **THEN** workspace root 下 SHALL 存在 `workspace.yaml`、`apps/`、`data/`、`draft/` 目录，以及 `.gitignore` 和 `.git/` 目录

#### Scenario: 声明与数据分离

- **WHEN** 用户将应用定义文件放在 `apps/{appName}/` 下
- **THEN** 该 app 的 Stable 运行时数据 SHALL 存放在 `data/apps/{appName}/` 下，Draft 运行时数据 SHALL 存放在 `draft/apps/{appName}/` 下，两者不与声明文件混合

### Requirement: Workspace 自动初始化

当 workspace 目录不存在或未初始化时，系统 SHALL 自动执行完整初始化流程，无需用户手动干预。

初始化步骤 SHALL 包含：
1. 创建 workspace root 目录（若不存在）
2. 创建 `apps/`、`data/` 和 `draft/` 子目录
3. 写入 `workspace.yaml`（默认 name 为 `"cozybase"`，version 为 `1`）
4. 写入 `.gitignore`（忽略 `data/`、`draft/`、`*.sqlite`、`*.sqlite-wal`、`*.sqlite-shm`）
5. 执行 `git init`
6. 创建示例 app：`apps/hello/app.yaml`（内容：`description: "Hello World"`）和 `apps/hello/migrations/001_init.sql`
7. 执行初始 git commit

#### Scenario: 首次启动自动初始化

- **WHEN** 用户首次启动 server，且 workspace 路径下不存在 `workspace.yaml`
- **THEN** 系统 SHALL 自动完成初始化，创建完整目录结构（含 `draft/`）、示例 app（含 migration 文件）和初始 git commit

#### Scenario: 已初始化的 workspace 不再重复初始化

- **WHEN** workspace root 下已存在 `workspace.yaml`
- **THEN** 系统 SHALL 跳过初始化流程，直接加载现有配置

#### Scenario: git 不可用时的降级处理

- **WHEN** 系统环境中未安装 git
- **THEN** 初始化 SHALL 跳过 `git init` 和初始 commit 步骤，打印警告信息，其余步骤正常完成

### Requirement: App 声明扫描

Workspace SHALL 扫描 `apps/` 目录下的所有子目录，发现包含 `app.yaml` 的目录作为有效的 app 声明。

扫描规则：
- app 名称 MUST 匹配 `^[a-zA-Z0-9_-]+$`
- 以 `.` 开头的目录 SHALL 被忽略
- 不包含 `app.yaml` 的目录 SHALL 被忽略

每个 app 目录可包含：
- `app.yaml` — app 元信息声明（必须）
- `migrations/*.sql` — 数据库 migration 文件（纯 SQL）
- `seeds/*.sql` 或 `seeds/*.json` — seed 数据文件
- `functions/*.ts` — 函数源代码（开发者用平台 SDK 编写）

#### Scenario: 扫描到有效 app

- **WHEN** `apps/todo-app/` 目录下存在 `app.yaml`
- **THEN** 系统 SHALL 将 `todo-app` 识别为有效 app，解析其 `app.yaml`、`migrations/*.sql`、`seeds/*` 和 `functions/*.ts`

#### Scenario: 忽略无效目录

- **WHEN** `apps/` 下存在 `.hidden/` 目录或不包含 `app.yaml` 的 `temp/` 目录
- **THEN** 系统 SHALL 忽略这些目录，不将其视为 app

### Requirement: Git 自动提交

Publish 成功后，系统 SHALL 自动执行 git commit，记录 `apps/` 目录的变更历史。

具体行为：
- 执行 `git add apps/{appName}/` 将该 App 的声明文件变更加入暂存区
- 自动生成 commit message，格式为 `publish: {appName} - {变更摘要}`
- 若 `apps/{appName}/` 没有实际文件变更，SHALL 跳过 commit
- git 命令失败 SHALL 不阻塞 Publish 流程，仅打印警告

Git commit SHALL 仅在 Publish 流程中执行，Draft Reconcile 和 Verify 均不触发 git commit。

#### Scenario: Publish 后自动提交

- **WHEN** Publish 成功完成且 `apps/{appName}/` 目录有文件变更
- **THEN** 系统 SHALL 执行 `git add apps/{appName}/` 和 `git commit`，commit message 包含 App 名称和变更信息

#### Scenario: 无变更时跳过提交

- **WHEN** Publish 成功完成但 `apps/{appName}/` 目录没有文件变更
- **THEN** 系统 SHALL 跳过 git commit

#### Scenario: git 命令失败降级

- **WHEN** git commit 或 git add 执行失败（如 git 未安装）
- **THEN** 系统 SHALL 打印警告信息，但 Publish 结果不受影响

## REMOVED Requirements

### Requirement: Platform DB 由 Workspace 管理

**Reason**: Platform DB 中的 `resource_state` 表用于声明式 diff 追踪，migration-based 模型不再需要。Platform DB 本身的管理职责不变，但需要重新评估其表结构。此 requirement 将在后续 change 中重新定义。

**Migration**: `resource_state` 表不再使用。Migration 追踪改为每个 App 的 SQLite 中的 `_migrations` 表。`apps`、`platform_users`、`api_keys` 等表保留不变。
