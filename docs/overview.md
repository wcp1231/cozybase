# 系统概述

## 定位

Cozybase 是一个本地 BaaS (Backend as a Service) 平台，为 AI Agent 提供可声明式编排的后端基础设施。一个进程、一个命令即可运行完整后端，无需 Docker、云服务或复杂部署。

与 Supabase/PocketBase 的对比：

| 特性 | Supabase | PocketBase | Cozybase |
|------|----------|------------|----------|
| 架构 | 多服务 (Postgres, GoTrue, ...) | 单二进制 (Go + SQLite) | 单进程 (Bun + SQLite) |
| 资源管理 | Web UI / API | Web UI / API | **声明式 Workspace** |
| 部署 | 云/自托管 | 自托管 | **本地优先** |
| Schema 管理 | Migration SQL | Web UI | **YAML 声明 + 自动迁移** |
| 目标用户 | 开发者 | 开发者 | **AI Agents** |

## 核心理念

### 声明式资源编排

受 Kubernetes 启发，Cozybase 采用"期望状态 → 实际状态"的 reconcile 模型：

```
用户编辑 YAML (期望状态)
        │
        ▼
  Watcher 检测变更
        │
        ▼
  Reconciler 对比差异
        │
        ▼
  自动执行 DDL (实际状态)
```

- 没有命令式的 "CREATE TABLE" API
- 没有手动 migration 文件
- 开发者只需维护 YAML spec，系统自动收敛

### Workspace = 代码 + 数据库结构

Workspace 是 git 管理的目录，包含所有 App 的声明式定义。把它加入版本控制，就获得了完整的 schema 变更历史。

### API 只管数据

REST API 不暴露任何结构变更接口。API 的职责是 CRUD 数据，结构由 Workspace 管理。

## 三层架构

```
┌─────────────────────────────────────────────────────────┐
│                    Workspace 层                          │
│  git-managed, 声明式 source of truth                     │
│                                                         │
│  my-workspace/                                          │
│    todo-app/app.yaml                                    │
│    todo-app/tables/todos.yaml    ← 表结构声明            │
│    todo-app/functions/notify.ts  ← 函数源码 (计划中)      │
│    blog-app/...                                         │
└────────────────────────┬────────────────────────────────┘
                         │ fs.watch (recursive)
                         │ 500ms debounce
┌────────────────────────▼────────────────────────────────┐
│                    Daemon 层                             │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐              │
│  │Workspace │  │Reconciler│  │  Watcher  │              │
│  │ Scanner  │─>│  Engine  │<─│  (fs)     │              │
│  └──────────┘  └────┬─────┘  └──────────┘              │
│                     │                                    │
│  ┌──────────┐  ┌────▼─────┐  ┌──────────┐              │
│  │  Hono    │  │  DbPool  │  │ EventBus │              │
│  │ HTTP API │─>│ (SQLite) │─>│ (pub/sub)│              │
│  └──────────┘  └──────────┘  └──────────┘              │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    Data 层                               │
│  运行时状态, 不进 git                                     │
│                                                         │
│  data/                                                  │
│    cozybase.sqlite          ← 平台元数据                  │
│    apps/todo-app/db.sqlite  ← App 独立数据库              │
│    apps/blog-app/db.sqlite                              │
└─────────────────────────────────────────────────────────┘
```

## 启动流程

```
bun run packages/server/src/index.ts --workspace ./my-workspace

1. 解析 CLI 参数 (--workspace, --port, --data)
2. 创建 Hono 应用 + DbPool
3. 初始化 Platform DB (cozybase.sqlite)
4. 首次全量 Reconcile：
   a. 扫描 workspace 目录
   b. 发现所有含 app.yaml 的子目录
   c. 解析每个 App 的 tables/*.yaml
   d. 对比 resource_state 中的 spec_hash
   e. 执行必要的 CREATE TABLE / ALTER TABLE
5. 启动 WorkspaceWatcher (fs.watch, recursive)
6. 挂载 HTTP 路由
7. 启动 Bun.serve 监听端口
8. 输出状态信息
```

## 技术栈选型

| 组件 | 选择 | 理由 |
|------|------|------|
| Runtime | Bun | 内置 SQLite、TypeScript 原生支持、极快启动速度 |
| HTTP | Hono | 轻量级、多 runtime 支持、中间件生态 |
| Database | SQLite (bun:sqlite) | 零依赖、单文件、WAL 模式并发 |
| Schema 验证 | Zod | TypeScript 类型推导、运行时验证 |
| YAML 解析 | yaml | YAML 1.2 完整支持 |
| 认证 | jose | 标准 JWT、无原生依赖 |
| ID 生成 | nanoid | 短、URL 安全、低碰撞 |

## 设计决策

### 为什么用 SQLite 而不是 Postgres？

- 零运维：不需要数据库服务
- 每个 App 独立 SQLite 文件：天然隔离
- 对 AI Agent 场景足够：本地应用不需要高并发写入
- WAL 模式提供足够的读写并发

### 为什么用声明式而不是命令式 API？

- 版本控制友好：YAML 文件可 git track
- 幂等性：多次 apply 同一 spec 结果相同
- 可审计：所有变更都有 git 历史
- AI Agent 友好：声明"我要什么"比"我要做什么"更自然

### 为什么每个 App 一个 SQLite 文件？

- 物理隔离：一个 App 数据损坏不影响其他
- 独立备份/恢复：只需复制文件
- 独立删除：删除 App 就是删除文件
- 无跨 App 数据泄露风险
