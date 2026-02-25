## Why

重新设计 Reconciler，引入 Stable/Draft 双版本模型和 Migration-based 数据库管理，使 AI Agent 能够安全地开发、验证和发布应用变更，而不影响生产环境中正在运行的应用。

### 背景与动机

当前 Reconciler 采用声明式模型（YAML 表定义 → diff → 直接应用 SQL），存在以下问题：

- **无隔离**：schema 变更直接作用于生产数据库，没有缓冲区。AI Agent 的每次修改都是即时生效的"生产部署"
- **不可回滚**：声明式 diff 无法 rollback，一旦破坏性变更执行就无法恢复
- **无法验证**：Agent 无法在安全环境中测试 schema 变更对真实数据的影响
- **无测试数据**：Agent 开发过程中没有 seed 数据可用于调试和验证

### 设计决策

1. **Stable/Draft 双版本模型**：一个 App 可以同时存在 Stable（生产）和 Draft（开发）两个版本，相互隔离。Stable 服务真实用户流量，Draft 只有 seed 和测试数据
2. **Git 即版本边界**：已 committed 的文件属于 Stable，unstaged changes 属于 Draft。不引入额外的版本管理机制
3. **Migration-based 数据库管理**：从声明式表定义（tables/*.yaml）改为有序 migration 文件（migrations/*.sql）。纯 SQL 格式，AI Agent 天然擅长生成
4. **三阶段发布流程**：Dev（在 Draft 上迭代开发）→ Verify（在 Stable 数据副本上验证 migration）→ Publish（正式发布 + git commit）
5. **Draft 数据库销毁重建策略**：每次 Draft Reconcile 时销毁并重建 draft.sqlite，重新执行全部 migrations + seeds。保证一致性，避免脏状态
6. **已 committed migration 不可变**：禁止修改已发布的 migration 文件，Verify 阶段检测并报错。需要变更已有结构必须创建新的 migration
7. **Seed 数据**：支持 JSON 或 SQL 格式的 seed 文件，每次 Draft Reconcile 时自动加载，用于 Agent 开发调试和功能验证
8. **Stable 数据库备份**：Publish 前自动备份 stable.sqlite，migration 执行失败时可恢复
9. **App 状态推导**：App 的 Stable/Draft/Deleted 状态由 git status 和 app.yaml 推导，不引入单独的状态字段。Deleted 状态通过 app.yaml 中 `status: deleted` 显式标记
10. **Publish 前 Verify 条件性强制**：如果 stable.sqlite 已存在（有真实数据），建议先执行 Verify；新 App 首次 Publish 无需 Verify

## What Changes

### Modify: Workspace 目录结构

新增 `draft/` 目录，存放 Draft 版本的运行时数据：

```
~/.cozybase/
├── workspace.yaml
├── apps/                              # 声明层（git tracked）
│   └── {app-name}/
│       ├── app.yaml                   # 元信息（可含 status: deleted）
│       ├── migrations/                # NEW: 替代 tables/ 目录
│       │   ├── 001_create_todos.sql   # 纯 SQL，数字前缀排序
│       │   ├── 002_add_users.sql
│       │   └── ...
│       ├── seeds/                     # NEW: seed 数据
│       │   ├── todos.sql              # 或 .json
│       │   └── ...
│       └── functions/
│           └── send-email.ts
│
├── data/                              # Stable 运行时（git ignored）
│   ├── platform.sqlite
│   └── apps/{app-name}/
│       └── db.sqlite                  # Stable 数据库
│
└── draft/                             # NEW: Draft 运行时（git ignored）
    └── apps/{app-name}/
        └── db.sqlite                  # Draft 数据库（seed + 测试数据）
```

`.gitignore` 新增 `draft/` 条目。

### Rewrite: Reconciler (`packages/server/src/core/reconciler.ts`)

从声明式 diff 引擎改为 migration 执行引擎：

- **Draft Reconcile**：销毁 draft.sqlite → 创建新库 → 按顺序执行所有 migrations/*.sql → 加载 seeds
- **Stable Reconcile（Publish 时调用）**：读取 _migrations 表 → 识别未执行的 migration → 增量执行 → 更新 _migrations 记录
- migration 执行记录通过每个 app 的 SQLite 中 `_migrations` 表追踪（仅 Stable 需要）

### New: Verify 流程

新增验证逻辑：

- 检测已 committed 的 migration 文件是否被修改（与 git HEAD 版本对比），修改则报错
- 复制 stable.sqlite → temp.sqlite
- 在 temp 上执行新增的 migrations
- 返回验证结果（成功/失败 + 变更摘要）
- 清理 temp.sqlite
- 后续可扩展：自动化测试、E2E 测试、性能测试

### New: Publish 流程

新增发布逻辑：

- 备份 stable.sqlite → stable.sqlite.bak
- 在 stable.sqlite 上增量执行新 migrations
- 若失败 → 恢复备份
- 加载新版 functions
- `git add apps/{appName}/ && git commit`
- 清理 draft.sqlite

### Modify: App 状态推导逻辑

App 状态不再是静态字段，而是动态推导：

| 条件 | 状态 |
|------|------|
| app.yaml 标记 `status: deleted` | Deleted |
| stable.sqlite 存在 + 无 unstaged changes | Stable |
| stable.sqlite 存在 + 有 unstaged changes | Stable + Draft |
| stable.sqlite 不存在 + 有 unstaged changes | Draft only |

### Modify: AppContext (`packages/server/src/core/app-context.ts`)

- 支持 Stable 和 Draft 两种模式的数据库连接
- Stable 模式：连接 `data/apps/{name}/db.sqlite`
- Draft 模式：连接 `draft/apps/{name}/db.sqlite`
- 路径管理新增 `draftDataDir` 和 `draftDbPath`

### Modify: HTTP API 路由

从单一路由拆分为 Stable/Draft 两套：

```
# Stable（用户访问）
/stable/apps/:appName/db/:table          CRUD
/stable/apps/:appName/db/:table/:id      CRUD
/stable/apps/:appName/functions/:name     调用 function

# Draft（Agent 开发用）
/draft/apps/:appName/db/:table           CRUD
/draft/apps/:appName/db/:table/:id       CRUD
/draft/apps/:appName/functions/:name     调用 function

# 管理接口
POST /draft/apps/:appName/reconcile      Draft Reconcile（销毁重建）
POST /draft/apps/:appName/verify         验证 migration 可行性
POST /draft/apps/:appName/publish        发布到 Stable
```

### Remove: 声明式表定义

- 移除 `tables/*.yaml` 相关逻辑（扫描、解析、Zod schema）
- 移除 Reconciler 中的 diff 算法（CREATE TABLE、ALTER TABLE 自动生成）
- 移除 platform DB 中的 `resource_state` 表（不再需要 diff 状态追踪）

### Modify: Workspace (`packages/server/src/core/workspace.ts`)

- 新增 `draftDir` 路径管理
- `scanApps()` 增加 migration 文件扫描和 unstaged 状态检测
- 自动初始化流程更新：.gitignore 增加 `draft/`，示例 app 使用 migration 格式
- Git commit 逻辑仅在 Publish 流程中调用，移除 reconcile 后自动 commit

## Capabilities

### New Capabilities

- `reconciler-draft-stable`: Stable/Draft 双版本模型，包含 Dev/Verify/Publish 三阶段发布流程、migration-based 数据库管理、seed 数据加载、App 状态推导

### Modified Capabilities

- `workspace-management`: 目录结构新增 `draft/`，Git commit 时机改为仅 Publish 时，.gitignore 更新，App 扫描逻辑变更（migration 替代 tables）
- `app-context`: 支持 Stable/Draft 双模式数据库连接，路径管理扩展

## Impact

### 受影响的代码

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/server/src/core/reconciler.ts` | 重写 | 从 diff 引擎改为 migration 执行引擎 + Dev/Verify/Publish 三流程 |
| `packages/server/src/core/workspace.ts` | 修改 | 新增 draftDir、migration 扫描、状态推导、移除 reconcile 后自动 commit |
| `packages/server/src/core/app-context.ts` | 修改 | Stable/Draft 双模式 DB 连接 |
| `packages/server/src/server.ts` | 修改 | 挂载新路由结构（/stable, /draft） |
| `packages/server/src/middleware/app-resolver.ts` | 修改 | 根据路由前缀注入 Stable 或 Draft 的 AppContext |
| `packages/server/src/modules/db/routes.ts` | 修改 | 适配新路由结构 |
| `packages/server/src/modules/apps/routes.ts` | 修改 | 新增 reconcile/verify/publish 端点 |

### API 影响

- **Breaking Change**: 路由前缀从 `/api/v1/app/:appName` 变更为 `/stable/apps/:appName` 和 `/draft/apps/:appName`
- **Breaking Change**: 移除 `POST /api/v1/reconcile`（全局 reconcile），改为按 App 粒度操作
- **新增**: `POST /draft/apps/:appName/reconcile`、`POST /draft/apps/:appName/verify`、`POST /draft/apps/:appName/publish`

### App 声明格式影响

- **Breaking Change**: `tables/*.yaml` 不再使用，改为 `migrations/*.sql`
- **新增**: `seeds/*.sql` 或 `seeds/*.json` 目录

### 不在范围内

- 多 Agent 同时修改同一 App（后续可考虑 git worktree）
- Migration 的 down/rollback 脚本（optional，MVP 不要求）
- 自动化测试 / E2E 测试集成（Verify 后续扩展）
- App 的物理删除 UI 和接口（仅实现 soft delete 标记）
- Functions 模块的完整运行时实现

### 风险

- Migration-based 模型对 AI Agent 的要求更高——需要正确生成有序 SQL migration 文件
- 已有 workspace 中的 `tables/*.yaml` 格式需要迁移到 `migrations/*.sql`
- Stable 数据库 migration 执行失败后的恢复依赖文件备份，大数据库备份可能耗时较长
