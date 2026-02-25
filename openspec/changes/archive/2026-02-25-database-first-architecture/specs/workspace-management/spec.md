## MODIFIED Requirements

### Requirement: Workspace 目录结构

系统 SHALL 使用以下固定的目录结构来组织 workspace：

- `workspace.yaml` — workspace 配置文件
- `data/` — Stable 运行时数据目录
- `data/platform.sqlite` — 平台级数据库（Source of Truth，含 `app_files` 表）
- `data/apps/{appName}/` — 各 app 的 Stable 数据目录（含 `db.sqlite` 和 `functions/`）
- `draft/` — Draft 运行时数据目录
- `draft/apps/{appName}/` — 各 app 的 Draft 数据目录（含 `db.sqlite` 和 `functions/`）

`data/` 和 `draft/` 的相对路径 SHALL 为硬编码约定，不可通过配置修改。

`apps/` 顶层目录不再存在。APP 定义文件的 Source of Truth 为 `data/platform.sqlite` 中的 `app_files` 表。

`data/apps/{appName}/functions/` 和 `draft/apps/{appName}/functions/` 为 function 文件的运行时缓存，由系统在 Reconcile/Publish 时从 DB 导出。

#### Scenario: workspace 目录结构完整性

- **WHEN** workspace 初始化完成后
- **THEN** workspace root 下 SHALL 存在 `workspace.yaml`、`data/`、`draft/` 目录。不应存在 `apps/`、`.git/`、`.gitignore`

#### Scenario: 定义与运行时数据分离

- **WHEN** 一个 App 的定义文件存储在 `data/platform.sqlite` 的 `app_files` 表中
- **THEN** 该 app 的 Stable 运行时数据 SHALL 存放在 `data/apps/{appName}/` 下，Draft 运行时数据 SHALL 存放在 `draft/apps/{appName}/` 下

### Requirement: Workspace 自动初始化

当 workspace 目录不存在或未初始化时，系统 SHALL 自动执行完整初始化流程，无需用户手动干预。

初始化步骤 SHALL 包含：
1. 创建 workspace root 目录（若不存在）
2. 创建 `data/` 和 `draft/` 子目录
3. 写入 `workspace.yaml`（默认 name 为 `"cozybase"`，version 为 `1`）
4. 初始化 Platform DB（触发 `initPlatformSchema()`，含 `app_files` 表和 `apps` 表新字段）
5. 从 `packages/server/templates/` 目录中读取所有模板应用的文件内容，写入 Platform DB 的 `app_files` 表和 `apps` 表
6. 对所有模板 App 执行 Publish 流程（创建 Stable DB、执行 Migration、导出 Functions 到 Stable 目录）

模板路径 SHALL 通过 `import.meta.dir` 相对定位到 `packages/server/templates/`，不依赖外部配置。

若模板目录不存在或为空，初始化 SHALL 正常完成（跳过模板加载步骤），并打印警告信息。

自动 Publish SHALL 仅在首次初始化时执行（通过 `justInitialized` 标记区分），避免后续启动时产生意外行为。

自动 Publish SHALL 在 server 层编排（`workspace.init()` + `workspace.load()` + 创建 Publisher 之后），而非在 `workspace.init()` 内部执行。

#### Scenario: 首次启动自动初始化

- **WHEN** 用户首次启动 server，且 workspace 路径下不存在 `workspace.yaml`
- **THEN** 系统 SHALL 自动完成初始化，创建完整目录结构、从模板目录读取文件写入 Platform DB、并设置模板 App 的 `current_version = 1`

#### Scenario: 模板应用加载到 DB

- **WHEN** 系统执行初始化且 `packages/server/templates/` 目录下存在 `welcome/` 子目录
- **THEN** 系统 SHALL 读取 `templates/welcome/` 下所有文件内容（`app.yaml`、`migrations/*.sql`、`seeds/*`、`functions/*.ts`），写入 `app_files` 表，并在 `apps` 表创建记录

#### Scenario: 已初始化的 workspace 不再重复初始化

- **WHEN** workspace root 下已存在 `workspace.yaml`
- **THEN** 系统 SHALL 跳过初始化流程，直接加载现有配置

#### Scenario: 模板目录不存在时的降级处理

- **WHEN** `packages/server/templates/` 目录不存在或为空
- **THEN** 初始化 SHALL 正常完成，跳过模板加载步骤，并打印警告信息

#### Scenario: 初始化后模板应用自动 Publish

- **WHEN** 系统首次初始化 workspace 完成后（`workspace.init()` 执行成功）
- **THEN** 系统 SHALL 对所有模板 App 自动执行 Publish 流程，使其状态变为 **Stable**，Stable 路由可正常访问

#### Scenario: 非首次启动不自动 Publish

- **WHEN** workspace 已经初始化过（`workspace.yaml` 存在），server 正常启动
- **THEN** 系统 SHALL 不自动执行 Publish，即使存在 Draft only 状态的 App

### Requirement: Platform DB Schema 扩展

系统 SHALL 在 Platform DB 中维护 `app_files` 表，存储所有 APP 的定义文件内容。

**`app_files` 表结构**：

```sql
CREATE TABLE IF NOT EXISTS app_files (
  app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  immutable INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (app_name, path)
);
```

- `(app_name, path)` 复合主键，天然唯一且可直接定位
- `path` 为相对路径，如 `migrations/001_init.sql`、`functions/hello.ts`、`seeds/todos.json`、`app.yaml`
- `content` 为文件的完整文本内容
- `immutable` 字段仅对 migration 文件有意义：Publish 时将已执行的 migration 标记为 `immutable = 1`，Management API 拒绝修改 `immutable = 1` 的文件
- 文件类型由 `path` 隐式决定（`migrations/*` = migration, `functions/*` = function, `seeds/*` = seed）

**扩展 `apps` 表**：

系统 SHALL 在 `apps` 表新增以下字段：

- `current_version INTEGER DEFAULT 0` — 每次 `update_app` / `update_app_file` 时递增，用于乐观锁
- `published_version INTEGER DEFAULT 0` — 最后一次成功 Publish 时的 `current_version` 值

新增字段 SHALL 使用条件 `ALTER TABLE`（先检查 `PRAGMA table_info`），确保幂等。

#### Scenario: Schema 初始化幂等

- **WHEN** `initPlatformSchema()` 被多次调用
- **THEN** `app_files` 表和 `apps` 表的新字段 SHALL 不会重复创建，不报错

#### Scenario: app_files 按 path 查询

- **WHEN** 查询 `SELECT content FROM app_files WHERE app_name = 'blog' AND path LIKE 'migrations/%' ORDER BY path`
- **THEN** 系统 SHALL 返回该 App 的所有 migration 文件内容，按路径排序

#### Scenario: ON DELETE CASCADE

- **WHEN** 从 `apps` 表删除一条记录
- **THEN** 该 App 在 `app_files` 表中的所有记录 SHALL 自动级联删除

### Requirement: App 定义从 DB 加载

系统 SHALL 从 Platform DB 的 `apps` 表加载 App 定义，不再扫描文件系统。

`AppDefinition` 退化为 `apps` 表的一行记录：

```typescript
interface AppDefinition {
  name: string;
  description: string;
  status: string;
  current_version: number;
  published_version: number;
}
```

需要 App 的文件内容时，SHALL 直接查询 `app_files` 表。

`refreshAppState()` SHALL 变为 DB 查询。`refreshAllAppStates()` SHALL 变为一次 `SELECT * FROM apps` 批量查询。

#### Scenario: 加载所有 App 定义

- **WHEN** Workspace 调用 `load()` 方法
- **THEN** 系统 SHALL 通过 `SELECT * FROM apps` 加载所有 App 定义，而非扫描文件系统

#### Scenario: App 名称校验

- **WHEN** 创建 App 时提供的名称不匹配 `^[a-zA-Z0-9_-]+$`
- **THEN** 系统 SHALL 拒绝创建，返回错误

### Requirement: 旧 Workspace 自动迁移

系统 SHALL 在启动时自动检测旧版（filesystem-first）workspace 并执行一次性迁移。

检测条件：`apps/` 目录存在 且 `app_files` 表为空。

迁移步骤：
1. 扫描 `apps/` 下所有 APP 目录（包含 `app.yaml` 的子目录）
2. 对每个 APP：
   a. 读取 `app.yaml` 解析 description
   b. `INSERT INTO apps`（如果不存在）
   c. 遍历所有文件（`migrations/*.sql`、`seeds/*`、`functions/*.ts`、`app.yaml`）→ `INSERT INTO app_files`
   d. 检查 stable DB 是否存在：
      - 存在 → 读取 `_migrations` 表，标记对应 migration 为 `immutable = 1`，设置 `published_version = current_version`
      - 不存在 → `published_version = 0`
3. 迁移完成后打印日志
4. `apps/` 目录保留不删除（用户可手动清理）

此逻辑 SHALL 放在 `Workspace.load()` 中，每次启动检查一次。`app_files` 表非空时跳过。

#### Scenario: 检测到旧版 workspace

- **WHEN** workspace 目录下存在 `apps/` 子目录且 `app_files` 表为空
- **THEN** 系统 SHALL 自动扫描 `apps/` 下所有 App，将文件内容写入 `app_files` 表

#### Scenario: 迁移已 Publish 的 App

- **WHEN** 旧版 workspace 中的 App 已 publish（`data/apps/{appName}/db.sqlite` 存在）
- **THEN** 系统 SHALL 读取 `_migrations` 表中已执行的版本号，将对应 migration 文件标记为 `immutable = 1`，并设置 `published_version = current_version`

#### Scenario: app_files 非空时跳过迁移

- **WHEN** `app_files` 表中已有记录
- **THEN** 系统 SHALL 跳过迁移逻辑，即使 `apps/` 目录仍存在

## REMOVED Requirements

### Requirement: App 声明扫描

**Reason**: APP 定义不再存储在文件系统 `apps/` 目录中，改为从 Platform DB 的 `app_files` 表加载。文件系统扫描不再需要。

**Migration**: 通过"旧 Workspace 自动迁移"将 `apps/` 目录下的文件一次性导入 DB。导入后 `apps/` 目录可删除。

### Requirement: Git 自动提交

**Reason**: 系统不再依赖 Git 进行版本控制和变更追踪。版本控制通过 `apps.current_version` 和 `apps.published_version` 字段实现，不可变校验通过 `app_files.immutable` 字段实现。

**Migration**: 移除所有 Git 相关代码（`execGit`、`isGitRepo`、`git init`、`git add`、`git commit`、`git status`、`git show`）。移除 `.gitignore` 生成逻辑。用户仍可选择对 workspace 目录使用 git 进行备份，但这是可选的外部行为。
