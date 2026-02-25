## Why

将 cozybase 的 APP 定义存储从 Filesystem + Git 迁移到 Database-first 架构，使 AI Agent（通过 MCP）和 Admin UI 能够通过统一的 Management API 创建和管理 APP，移除 Git 依赖，实现内建版本控制。

### 背景与动机

当前架构中，APP 的定义文件（migrations、functions、seeds、app.yaml）存放在文件系统的 `apps/` 目录下，通过 Git 追踪变更历史和实现 migration 不可变校验。这个设计在开发者直接操作文件系统时运作良好，但面临以下挑战：

1. **AI Agent 接入困难**：Agent 需要通过 MCP 与 cozybase 交互时，必须先获取文件、修改后再写回，但文件系统不是 API 友好的接口——且缺乏冲突检测、原子性保证等必要机制
2. **Admin UI 无法直接操作**：Web UI 没有文件系统访问权限，需要额外的 API 层将文件操作封装为 HTTP 接口，但这又导致"文件系统"和 "API" 两个入口的一致性问题
3. **Git 依赖是负担**：需要用户环境安装 Git，spawn 子进程执行命令，处理 Git 状态异常（detached head、merge conflict 等），且不可变校验依赖 `git status` 和 `git show` 命令
4. **双入口不一致风险**：用户可以直接编辑文件绕过 API，也可以通过 API 写文件，两条路径可能产生冲突

### 设计决策

1. **Database as Source of Truth**：APP 的所有定义文件（migrations、functions、seeds、config）存储在 Platform DB 的 `app_files` 表中，文件系统不再是 source of truth
2. **内建版本控制（渐进式）**：MVP 阶段通过 `apps.current_version` 实现乐观锁，`app_files.immutable` 字段标记已发布的 migration 实现不可变校验。后续按需添加 `app_versions` 表实现完整的版本历史和回滚能力
3. **Management API 作为唯一入口**：所有 APP 操作——无论来自 Admin UI、MCP Agent、还是 CLI——都通过同一套 Management API，消除双入口问题
4. **Checkout-Edit-Push 交互模型**：Agent 和 Admin UI 通过 `fetch_app()` 获取完整 APP 快照，本地/内存中编辑后通过 `update_app()` 推回，配合乐观锁防止冲突
5. **文件系统变为运行时缓存**：Reconcile/Publish 时从 DB 导出 migration SQL 执行、导出 function 文件供 Bun import，`data/` 和 `draft/` 目录仍然存在但仅作为运行时产物
6. **移除 Git 依赖**：不再需要 git init、git add、git commit、git status、git show 等命令，整个系统无外部依赖
7. **极简 MCP 工具集**：提供 6 个核心工具（create_app、list_apps、fetch_app、update_app_file、update_app、delete_app）加上已有的 reconcile/verify/publish/query，Agent 不需要理解十几个细粒度资源管理工具

### 关键权衡

- **失去**：用户不能直接 `vim apps/blog/functions/posts.ts` 编辑文件（需要通过 CLI/API）
- **失去**：没有 `git diff`、`git log` 这样成熟的 diff 工具（需要自建版本对比）
- **获得**：统一的数据入口，API 一致性，零外部依赖，天然支持 Web UI 和 Agent
- **获得**：更简单的部署（单 SQLite 文件包含所有 APP 定义），更容易备份和迁移

### 对比参考

此设计参考了 Supabase 的模型——资源通过 Management API 管理，Dashboard 和 CLI 操作同一个真相源。不同之处在于 cozybase 使用 SQLite 而非 PostgreSQL，且保持本地优先的定位。

## What Changes

### New: Platform DB Schema 扩展

在 `data/platform.sqlite` 中新增 `app_files` 表，扩展 `apps` 表：

**`app_files`** — 存储 APP 的所有定义文件：

```sql
CREATE TABLE app_files (
  app_name TEXT NOT NULL REFERENCES apps(name) ON DELETE CASCADE,
  path TEXT NOT NULL,              -- 相对路径，如 'migrations/001_init.sql'
  content TEXT NOT NULL,           -- 文件内容
  immutable INTEGER DEFAULT 0,    -- 1 = 不可修改（已 publish 的 migration）
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (app_name, path)
);
```

- `(app_name, path)` 复合主键，天然唯一且可直接定位
- `immutable` 字段仅对 migration 文件有意义：Publish 时将已执行的 migration 标记为 `immutable = 1`，后续 update_app 拒绝修改 `immutable = 1` 的文件
- 不需要 `file_type` 字段：文件类型由 `path` 隐式决定（`migrations/*` = migration, `functions/*` = function, `seeds/*` = seed）

**扩展 `apps` 表**：

```sql
ALTER TABLE apps ADD COLUMN current_version INTEGER DEFAULT 0;
ALTER TABLE apps ADD COLUMN published_version INTEGER DEFAULT 0;
```

- `current_version`：每次 `update_app` / `update_app_file` 时递增，用于乐观锁
- `published_version`：最后一次成功 `publish` 时的 `current_version` 值

**关于版本历史（`app_versions`）**：MVP 阶段不实现。当前 `current_version` + `published_version` 足以支撑乐观锁和状态推导。后续需要"回滚到历史版本"或"查看变更历史"功能时，再添加 `app_versions` 表（每次 Publish 时创建包含所有文件内容的 JSON 快照）。

### New: Management API（`/api/v1/apps/*` 扩展）

在现有的 apps routes 基础上，新增文件管理相关的 API：

| 方法 | 路由 | 说明 |
|------|------|------|
| POST | `/api/v1/apps` | 创建 APP（返回完整目录结构和示例文件） |
| GET | `/api/v1/apps` | 列出所有 APP 基本信息（已有，需扩展） |
| GET | `/api/v1/apps/:name` | 获取 APP 完整信息，包括所有文件内容和版本号 |
| PUT | `/api/v1/apps/:name` | 整体更新 APP（提交所有文件，乐观锁） |
| PUT | `/api/v1/apps/:name/files/*` | 更新单个文件 |
| DELETE | `/api/v1/apps/:name` | 删除 APP |

### New: MCP 工具集

基于 Management API 封装的 MCP 工具，供 AI Agent 使用：

| Tool | 对应 API | 说明 |
|------|----------|------|
| `create_app(name, description)` | POST `/api/v1/apps` | 创建 APP，返回目录结构和模板文件 |
| `list_apps()` | GET `/api/v1/apps` | 列出所有 APP 基本信息 |
| `fetch_app(app_name)` | GET `/api/v1/apps/:name` | 获取完整 APP 内容（文件+版本号） |
| `update_app(app_name, files, base_version)` | PUT `/api/v1/apps/:name` | 整体更新 APP（乐观锁） |
| `update_app_file(app_name, path, content)` | PUT `/api/v1/apps/:name/files/*` | 更新单个文件 |
| `delete_app(app_name)` | DELETE `/api/v1/apps/:name` | 删除 APP |
| `reconcile(app_name)` | POST `/draft/apps/:name/reconcile` | 已有 |
| `verify(app_name)` | POST `/draft/apps/:name/verify` | 已有 |
| `publish(app_name)` | POST `/draft/apps/:name/publish` | 已有 |
| `query(app_name, sql, mode)` | POST `/{mode}/apps/:name/db/sql` | 已有 |
| `get_schema(app_name, mode)` | GET `/{mode}/apps/:name/db/schema` | 已有 |

### Modify: Workspace（`packages/server/src/core/workspace.ts`）

大幅简化：

- 移除：`scanApps()` 中的文件系统扫描逻辑（App 定义从 DB 读取）
- 移除：所有 Git 相关代码（`execGit`、`isGitRepo`、`git init`、`git add`、`git commit`）
- 移除：`.gitignore` 生成逻辑
- 保留：目录结构管理（`data/`、`draft/` 仍需要用于运行时 SQLite 和 function 缓存）
- 保留：Platform DB 初始化（schema 需要扩展新增 `app_files` 表和 `apps` 表新字段）
- 保留：AppContext 注册表和生命周期管理
- 修改：`init()` 不再执行 git init，不再复制模板文件到 `apps/` 目录（改为在 DB 中创建模板 APP 记录）
- 新增：`refreshAppState()` 从 DB 推导状态（不再依赖 git status）

### Modify: App 状态推导

不再依赖 Git status，改为基于 DB 字段推导：

| 条件 | 状态 |
|------|------|
| `app.status = 'deleted'` | Deleted |
| `published_version = 0`（从未 publish）| Draft only |
| `published_version > 0` 且 `current_version = published_version` | Stable |
| `published_version > 0` 且 `current_version > published_version` | Stable + Draft |

### Modify: DraftReconciler（`packages/server/src/core/draft-reconciler.ts`）

- 数据来源从文件系统改为 Platform DB
- 从 `app_files` 查询 `WHERE app_name = ? AND path LIKE 'migrations/%' ORDER BY path` 获取 migration SQL
- 从 `app_files` 查询 `WHERE app_name = ? AND path LIKE 'seeds/%' ORDER BY path` 获取 seed 数据
- 从 `app_files` 查询 `WHERE app_name = ? AND path LIKE 'functions/%'` 获取 function 代码
- function 导出：将 function 内容写入 `draft/apps/{appName}/functions/` 目录供 Bun import
- 其余逻辑不变：销毁重建 draft SQLite、执行 migration、加载 seed

### Modify: Publisher（`packages/server/src/core/publisher.ts`）

- 移除：Git commit 逻辑
- 新增：将已执行的 migration 文件标记为 `immutable = 1`
- 新增：更新 `apps.published_version = current_version`
- function 导出：将 function 内容写入 `data/apps/{appName}/functions/` 目录供 Stable 运行时使用
- 其余逻辑不变：备份 stable DB、增量执行 migration、恢复失败时回滚

### Modify: Verifier（`packages/server/src/core/verifier.ts`）

- 移除：Git diff 比较（`git show HEAD:...` vs 工作区）
- 替代：检查 `app_files` 中 `immutable = 1` 的记录是否被修改（不应该发生，因为 API 层会拒绝修改 `immutable = 1` 的文件，但作为防御性检查保留）
- 其余逻辑不变：复制 stable DB 到临时文件、执行新 migration 验证

### Modify: AppManager（`packages/server/src/modules/apps/manager.ts`）

- 扩展 `create()` 方法：创建 APP 时在 `app_files` 中写入模板文件（app.yaml + 示例 migration + 示例 function）
- 扩展 `list()` 方法：返回 version 信息
- 新增 `getAppWithFiles(appName)` — 获取 APP 信息及所有文件
- 新增 `updateFiles(appName, files, baseVersion)` — 整体更新（含乐观锁校验，拒绝修改 `immutable = 1` 的文件）
- 新增 `updateFile(appName, path, content)` — 单文件更新（拒绝修改 `immutable = 1` 的文件）

### Modify: Workspace 初始化

- 首次启动时：创建 `data/` 和 `draft/` 目录、初始化 Platform DB（含新表）
- 模板 APP 处理：在 DB 中创建 `welcome` APP 的 `app_files` 记录（从 `packages/server/templates/` 读取内容写入 DB）
- 自动 Publish：逻辑不变，数据来源改为 DB

### Remove: 文件系统 APP 目录

- `apps/` 目录不再作为 APP 定义的存储位置
- `workspace.yaml` 保留（workspace 元配置）
- `.gitignore` 和 `.git/` 不再自动生成
- 用户仍然可以选择对 workspace 目录使用 git 来备份 `data/platform.sqlite`，但这是可选的

### Workspace 目录结构（变更后）

```
$HOME/.cozybase/
├── workspace.yaml                  # workspace 配置（保留）
├── data/
│   ├── platform.sqlite             # Source of Truth（含 app_files）
│   └── apps/
│       ├── welcome/
│       │   ├── db.sqlite           # Stable runtime DB
│       │   └── functions/          # Stable function files（从 DB 导出）
│       │       └── todos.ts
│       └── blog/
│           ├── db.sqlite
│           └── functions/
│               └── posts.ts
└── draft/
    └── apps/
        ├── welcome/
        │   ├── db.sqlite           # Draft runtime DB
        │   └── functions/          # Draft function files（从 DB 导出）
        │       └── todos.ts
        └── blog/
            ├── db.sqlite
            └── functions/
                └── posts.ts
```

注意：`apps/` 顶层目录不再存在。function 文件在 `data/` 和 `draft/` 下按需从 DB 导出。

## Capabilities

### Modified Capabilities

- `workspace-management`：移除文件系统扫描、Git 依赖、`apps/` 目录管理；新增 Platform DB schema 扩展（`app_files` 表、`apps` 表新字段）、Management API
- `reconciler-draft-stable`：数据来源从文件系统改为 DB；App 状态推导从 Git status 改为 DB 字段；Verify 从 Git diff 改为 `immutable` 字段检查；Publish 从 Git commit 改为 DB `immutable` 标记

### New Capabilities

- `management-api`：APP 生命周期管理的 HTTP API 层（CRUD + 文件管理）
- `mcp-tools`：基于 Management API 封装的 MCP 工具集，供 AI Agent 使用

## Impact

### 受影响的代码

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/server/src/core/workspace.ts` | 重构 | 移除 Git 和文件扫描，简化为 DB + 目录管理 |
| `packages/server/src/core/draft-reconciler.ts` | 修改 | 数据来源从文件系统改为 DB |
| `packages/server/src/core/publisher.ts` | 修改 | 移除 Git commit，新增 `immutable` 标记 |
| `packages/server/src/core/verifier.ts` | 修改 | 移除 Git diff，改用 `immutable` 字段检查 |
| `packages/server/src/modules/apps/manager.ts` | 扩展 | 新增文件管理方法 |
| `packages/server/src/modules/apps/routes.ts` | 扩展 | 新增 Management API 路由 |
| `packages/server/src/core/app-context.ts` | 修改 | AppDefinition 来源从文件扫描改为 DB |
| `packages/server/src/core/migration-runner.ts` | 修改 | migration SQL 来源从文件改为 DB |
| `packages/server/src/core/seed-loader.ts` | 修改 | seed 数据来源从文件改为 DB |

### API 影响

- 现有的 `/stable/apps/:name/db/*` 和 `/draft/apps/:name/db/*` 路由不受影响
- 现有的 `/draft/apps/:name/reconcile|verify|publish` 路由不受影响（内部实现变更）
- 新增 `/api/v1/apps` 相关的 Management API 路由
- 启动参数：移除 Git 依赖相关的降级逻辑

### 依赖

- 无外部依赖（移除 Git 依赖）

### 不在范围内

- Admin UI 实现（本次只提供 API 层）
- MCP Server 实现（本次只定义工具接口，实现在后续 change）
- CLI 工具实现（可选的命令行客户端）
- 多 workspace 支持
- 版本历史和回滚功能（`app_versions` 表，后续 change）
- 导入/导出功能（将 DB 中的 APP 导出为文件目录、或从文件目录导入到 DB）
- 实时协作 / WebSocket 推送

### 迁移策略

对于已有的 filesystem-first workspace：

1. 启动时检测：若 `apps/` 目录存在且 `app_files` 表为空，执行一次性迁移
2. 迁移过程：扫描 `apps/` 下所有 APP 的文件，写入 `app_files` 表
3. 对已 publish 的 APP：读取 stable DB 的 `_migrations` 表，将对应 migration 文件标记为 `immutable = 1`
4. 迁移完成后，`apps/` 目录可安全删除（或保留作为备份）

### 风险

- **数据安全**：SQLite 文件损坏可能导致所有 APP 定义丢失。需要提供备份机制（定期导出或 WAL checkpoint 管理）
- **scope 较大**：几乎所有核心模块都需要修改，建议分阶段实施
- **function 导出开销**：每次 reconcile/publish 都需要将 function 从 DB 写出到文件系统供 Bun import，增加 I/O 开销（但 APP 规模通常较小，影响可忽略）
