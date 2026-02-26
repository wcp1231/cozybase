# MCP Tools

## Purpose

Provide a complete MCP tool interface for AI Agents to manage CozyBase APPs via the MCP protocol. The system supports dual deployment modes (embedded and remote) through a Backend Adapter pattern, with Agent working directory management for file-based workflows.

## Requirements

### Requirement: cozybase mcp 入口与双模式架构

系统 SHALL 提供 `cozybase mcp` CLI 命令作为统一的 MCP Server 入口。该命令通过 stdio 传输协议与 Agent 通信，支持两种部署模式：

**本地模式（默认）：**
```bash
cozybase mcp --apps-dir /path/to/workspace
```
嵌入式运行，直接调用 cozybase 内部模块，无网络开销。

**远程模式：**
```bash
cozybase mcp --url http://homelab.local:2765 --apps-dir /path/to/workspace
```
通过 HTTP API 连接远程 cozybase 实例。

`cozybase mcp` SHALL 通过 Backend Adapter 模式（`CozybaseBackend` 接口）抽象两种部署方式的差异。MCP 工具层代码 SHALL 对两种模式完全一致，不包含任何模式判断逻辑。

`CozybaseBackend` 接口 SHALL 包含以下方法：
- `createApp(name, description?)` — 创建 APP
- `listApps()` — 列出所有 APP
- `fetchApp(name)` — 获取 APP 快照（含文件内容）
- `deleteApp(name)` — 删除 APP
- `pushFiles(name, files)` — 批量推送文件
- `pushFile(name, path, content)` — 推送单个文件
- `reconcile(name)` — 重建 Draft 环境
- `verify(name)` — 验证变更
- `publish(name)` — 发布到 Stable
- `executeSql(name, sql, mode)` — 执行 SQL
- `callApi(name, method, path, body?, mode?)` — 调用 APP API

#### Scenario: 本地模式启动
- **WHEN** 运行 `cozybase mcp --apps-dir /tmp/workspace`
- **THEN** 系统 SHALL 启动 MCP Server（stdio），使用 EmbeddedBackend 直接调用内部模块

#### Scenario: 远程模式启动
- **WHEN** 运行 `cozybase mcp --url http://homelab.local:2765 --apps-dir /tmp/workspace`
- **THEN** 系统 SHALL 启动 MCP Server（stdio），使用 RemoteBackend 通过 HTTP API 与远程 cozybase 通信

#### Scenario: 工具层模式透明
- **WHEN** MCP 工具处理 Agent 请求时
- **THEN** 工具 SHALL 仅通过 `CozybaseBackend` 接口调用，不判断当前是本地模式还是远程模式

### Requirement: Agent 工作目录管理

`cozybase mcp` SHALL 管理 Agent 工作目录，位置通过以下优先级确定（从高到低）：

1. `--apps-dir` 参数
2. `COZYBASE_APPS_DIR` 环境变量
3. `process.cwd()`（当前工作目录）

每个 APP 对应一个子目录 `{apps_dir}/{app-name}/`，目录结构如下：
```
{apps_dir}/{app-name}/
├── app.yaml
├── migrations/
│   ├── 001_init.sql
│   └── 002_add_users.sql
├── seeds/
│   └── init.json
├── functions/
│   ├── hello.ts
│   └── stats.ts
└── ui/
    └── pages.json
```

Agent 工作目录 SHALL 与 cozybase 数据目录（`~/.cozybase/`）完全独立。两个目录可能在不同的机器上。

#### Scenario: 默认使用当前工作目录

- **WHEN** 运行 `cozybase mcp` 未指定 `--apps-dir` 且未设置 `COZYBASE_APPS_DIR`
- **THEN** 系统 SHALL 使用 `process.cwd()` 作为 Agent 工作目录根目录

#### Scenario: 通过参数配置工作目录
- **WHEN** 运行 `cozybase mcp --apps-dir /home/user/projects`
- **THEN** 系统 SHALL 使用 `/home/user/projects` 作为 Agent 工作目录根目录

#### Scenario: 通过环境变量配置工作目录
- **WHEN** 设置 `COZYBASE_APPS_DIR=/home/user/projects` 并运行 `cozybase mcp`
- **THEN** 系统 SHALL 使用 `/home/user/projects` 作为 Agent 工作目录根目录

#### Scenario: APP 子目录
- **WHEN** Agent 操作名为 "todo" 的 APP
- **THEN** 系统 SHALL 在 `{apps_dir}/todo/` 下读写该 APP 的文件

### Requirement: MCP 工具集定义

系统 SHALL 通过 `cozybase mcp` CLI 命令提供以下 MCP 工具，供 AI Agent 通过 MCP 协议操作 APP。工具实现基于 Backend Adapter 模式，支持本地嵌入和远程 HTTP 两种部署方式。

| 层级 | Tool | 说明 |
|------|------|------|
| App 生命周期 | `create_app` | 创建 APP，提取模板到 Agent 工作目录 |
| App 生命周期 | `list_apps` | 列出所有 APP |
| App 生命周期 | `fetch_app` | cozybase → Agent 工作目录同步 |
| App 生命周期 | `delete_app` | 删除 APP 及所有数据 |
| 文件同步 | `update_app` | Agent 工作目录 → cozybase 全量同步 |
| 文件同步 | `update_app_file` | Agent 工作目录单文件 → cozybase |
| 开发工作流 | `reconcile_app` | 重建 Draft 环境（DB + seeds + functions） |
| 开发工作流 | `verify_app` | 验证变更可安全发布 |
| 开发工作流 | `publish_app` | 发布到 Stable |
| 运行时交互 | `execute_sql` | 开发者视角：操作数据库 |
| 运行时交互 | `call_api` | 用户视角：调用 APP HTTP 端点 |

#### Scenario: Agent 完整使用工具集
- **WHEN** Agent 需要从零构建一个 APP
- **THEN** Agent SHALL 使用 create_app 创建 → 文件工具编辑 → update_app 同步 → reconcile_app 重建 → execute_sql/call_api 验证 → verify_app 检查 → publish_app 发布

### Requirement: create_app 工具

`create_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | APP 名称 |
| `description` | string | 否 | APP 描述 |

工具 SHALL：
1. 通过 Backend Adapter 创建 APP，获取 AppSnapshot（含模板文件内容）
2. 将模板文件写入 Agent 工作目录 `{apps_dir}/{name}/`
3. 返回 `{ name, description, directory, files }` — 其中 `directory` 为工作目录绝对路径，`files` 为文件路径列表（不含内容）

Agent 使用自身文件工具读取工作目录中的文件内容。

#### Scenario: Agent 创建 APP
- **WHEN** Agent 调用 `create_app(name: "blog", description: "博客系统")`
- **THEN** 工具 SHALL 创建 APP 并将模板文件写入 Agent 工作目录，返回 `{ name: "blog", description: "博客系统", directory: "{apps_dir}/blog", files: ["app.yaml", "migrations/001_init.sql", "functions/hello.ts"] }`

### Requirement: list_apps 工具

`list_apps` 工具 SHALL 不需要参数，通过 Backend Adapter 返回所有 APP 的基本信息列表。

#### Scenario: Agent 列出 APP
- **WHEN** Agent 调用 `list_apps()`
- **THEN** 工具 SHALL 返回所有 APP 的 name、description、state、version 信息

### Requirement: fetch_app 工具

`fetch_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL：
1. 通过 Backend Adapter 获取 AppSnapshot（含所有文件内容）
2. 清空 Agent 工作目录 `{apps_dir}/{app_name}/`（避免残留已删除的文件）
3. 将所有文件写入 Agent 工作目录
4. 返回 `{ name, description, state, current_version, published_version, directory, files }` — 其中 `files` 为文件路径列表（不含内容）

Agent 使用自身文件工具读取工作目录中的文件内容。

#### Scenario: Agent 获取 APP
- **WHEN** Agent 调用 `fetch_app(app_name: "blog")`
- **THEN** 工具 SHALL 从 cozybase 获取文件并写入 Agent 工作目录，返回包含 directory 和 files 列表的结果

#### Scenario: 清空残留文件
- **WHEN** Agent 调用 `fetch_app`，且工作目录中存在 cozybase 中已删除的文件
- **THEN** 工具 SHALL 先清空工作目录再写入，确保工作目录与 cozybase 完全一致

### Requirement: update_app 工具

`update_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL：
1. 扫描 Agent 工作目录 `{apps_dir}/{app_name}/` 收集所有文件（路径 + 内容）
2. 通过 Backend Adapter 调用 `pushFiles(name, files)` 进行全量同步：
   - 新增：Agent 有、cozybase 无
   - 修改：Agent 有、cozybase 有、内容不同
   - 删除：Agent 无、cozybase 有（且非 immutable）
   - immutable 文件内容变更则报错
3. 返回 `{ files, changes: { added, modified, deleted } }`

工具 SHALL 跳过超过 1MB 的文件。

#### Scenario: Agent 全量同步
- **WHEN** Agent 在工作目录中编辑了多个文件后调用 `update_app(app_name: "todo")`
- **THEN** 工具 SHALL 扫描工作目录并推送所有变更，返回 added/modified/deleted 的文件列表

#### Scenario: immutable 文件保护
- **WHEN** Agent 修改了工作目录中已发布的 migration 文件后调用 `update_app`
- **THEN** 工具 SHALL 返回错误，提示该 migration 文件为 immutable 不可修改

### Requirement: update_app_file 工具

`update_app_file` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `path` | string | 是 | 文件路径（相对于 APP 目录） |

工具 SHALL：
1. 读取 Agent 工作目录中 `{apps_dir}/{app_name}/{path}` 的文件内容
2. 通过 Backend Adapter 调用 `pushFile(name, path, content)` 进行 UPSERT
3. 返回 `{ path, status: 'created' | 'updated' }`

工具描述 SHALL 补充 UI 文件相关的指引信息，告知 Agent：
- APP 的 UI 定义存储在 `ui/pages.json` 文件中
- `ui/pages.json` 使用 JSON 格式，包含 `pages`（页面列表）和 `components`（可选的自定义组件声明）
- 每个 page 包含 `id`、`title`、`body` 字段（`id` 同时作为路由路径段）
- body 中的组件通过 `type` 指定类型，可用的内置组件类型包括：`page`、`row`、`col`、`card`、`tabs`、`divider`、`table`、`list`、`text`、`heading`、`tag`、`stat`、`form`、`input`、`textarea`、`number`、`select`、`switch`、`checkbox`、`radio`、`date-picker`、`button`、`link`、`dialog`、`alert`、`empty`
- 交互行为通过 action 声明，支持的 action 类型：`api`、`reload`、`dialog`、`link`、`close`、`confirm`
- API URL 使用 App 相对路径（如 `/db/todo`、`/functions/todos`），渲染器自动补全

#### Scenario: Agent 更新 UI 文件
- **WHEN** Agent 在工作目录中修改了 `ui/pages.json` 后调用 `update_app_file(app_name: "welcome", path: "ui/pages.json")`
- **THEN** 工具 SHALL 读取工作目录中的文件内容并推送到 cozybase

#### Scenario: Agent 更新其他文件
- **WHEN** Agent 在工作目录中修改了 `functions/posts.ts` 后调用 `update_app_file(app_name: "blog", path: "functions/posts.ts")`
- **THEN** 工具 SHALL 读取工作目录中的文件内容并推送到 cozybase

### Requirement: delete_app 工具

`delete_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL：
1. 通过 Backend Adapter 删除 APP 的所有 DB 记录和文件系统数据
2. 清理 Agent 工作目录 `{apps_dir}/{app_name}/`

此操作不可逆。工具描述 SHALL 包含强烈警告。

#### Scenario: Agent 删除 APP
- **WHEN** Agent 调用 `delete_app(app_name: "blog")`
- **THEN** 工具 SHALL 删除 cozybase 中的 APP 数据并清理 Agent 工作目录

### Requirement: reconcile_app 工具

`reconcile_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL 通过 Backend Adapter 触发 Draft 环境重建，包括：
- 重建 Draft 数据库（执行所有 migrations）
- 导入 seed 数据
- 导出 functions 到运行时目录

返回 reconcile 结果，包含执行的 migration 列表和状态。

#### Scenario: Agent 重建 Draft 环境
- **WHEN** Agent 调用 `reconcile_app(app_name: "todo")`
- **THEN** 工具 SHALL 通过 Backend Adapter 调用 `reconcile("todo")`，返回包含执行的 migrations 和 seeds 状态的结果

#### Scenario: reconcile 失败
- **WHEN** APP 的 migration 包含语法错误
- **THEN** 工具 SHALL 返回错误信息，包含失败的 migration 文件名和具体错误

### Requirement: verify_app 工具

`verify_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL 通过 Backend Adapter 触发变更验证，检查当前 Draft 变更是否可以安全发布到 Stable。

#### Scenario: 验证通过
- **WHEN** Agent 调用 `verify_app(app_name: "todo")` 且变更可安全发布
- **THEN** 工具 SHALL 返回验证通过的结果

#### Scenario: 验证失败
- **WHEN** Agent 调用 `verify_app(app_name: "todo")` 且变更存在兼容性问题
- **THEN** 工具 SHALL 返回验证失败的详细信息，包括不兼容的变更描述

### Requirement: publish_app 工具

`publish_app` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |

工具 SHALL 通过 Backend Adapter 触发发布操作，将 Draft 变更应用到 Stable 环境。发布后，已执行的 migration 文件 SHALL 变为 immutable。

#### Scenario: Agent 发布 APP
- **WHEN** Agent 调用 `publish_app(app_name: "todo")`
- **THEN** 工具 SHALL 通过 Backend Adapter 调用 `publish("todo")`，返回发布结果（包含新的 published_version）

#### Scenario: 发布前未 verify
- **WHEN** Agent 调用 `publish_app` 但之前未通过 verify
- **THEN** 工具 SHALL 按 Backend 行为返回相应错误

### Requirement: execute_sql 工具

`execute_sql` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `sql` | string | 是 | SQL 语句 |
| `mode` | string | 否 | `"draft"`（默认）或 `"stable"` |

**SQL 语句分类检查：**

工具 SHALL 根据 SQL 语句的第一个关键字对语句进行分类：
- `SELECT`、`WITH`、`EXPLAIN` → `select`
- `PRAGMA`（只读类）→ `pragma_read`；`PRAGMA ... = ...`（赋值类）→ `pragma_write`
- `INSERT`、`UPDATE`、`DELETE`、`REPLACE` → `dml`
- `CREATE`、`DROP`、`ALTER`、`ATTACH`、`DETACH` → `ddl`
- 其他 → `unknown`

**权限矩阵：**

| 语句类型 | Draft | Stable |
|---------|-------|--------|
| select | 允许 | 允许 |
| pragma_read | 允许 | 允许 |
| pragma_write | 允许 | 禁止 |
| dml | 允许 | 禁止 |
| ddl | 禁止 | 禁止 |
| unknown | 禁止 | 禁止 |

**安全措施：**
- 工具 SHALL 拒绝包含分号分隔的多条语句
- 结果集 SHALL 最多返回 1000 行
- 执行超时 SHALL 为 5 秒

**返回格式：**
```json
{
  "columns": ["id", "title", "completed"],
  "rows": [[1, "Buy milk", 0], [2, "Read book", 1]],
  "rowCount": 2
}
```

#### Scenario: Draft 模式执行 SELECT
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "SELECT * FROM tasks", mode: "draft")`
- **THEN** 工具 SHALL 返回查询结果，包含 columns、rows 和 rowCount

#### Scenario: Draft 模式执行 DML
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "INSERT INTO tasks (title) VALUES ('test')", mode: "draft")`
- **THEN** 工具 SHALL 执行插入操作并返回结果

#### Scenario: Stable 模式拒绝 DML
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "DELETE FROM tasks WHERE id = 1", mode: "stable")`
- **THEN** 工具 SHALL 拒绝执行并返回权限错误

#### Scenario: 拒绝 DDL 语句
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "DROP TABLE tasks")`
- **THEN** 工具 SHALL 拒绝执行并返回错误，提示 schema 变更必须通过 migration 文件

#### Scenario: 拒绝多语句
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "SELECT 1; DROP TABLE tasks")`
- **THEN** 工具 SHALL 拒绝执行并返回错误

#### Scenario: 默认 mode 为 draft
- **WHEN** Agent 调用 `execute_sql(app_name: "todo", sql: "SELECT * FROM tasks")` 未指定 mode
- **THEN** 工具 SHALL 默认使用 draft 模式

### Requirement: call_api 工具

`call_api` 工具 SHALL 接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `app_name` | string | 是 | APP 名称 |
| `method` | string | 是 | HTTP 方法（GET/POST/PUT/DELETE 等） |
| `path` | string | 是 | API 路径（如 `/db/tasks`、`/functions/hello`） |
| `body` | object | 否 | 请求体 |
| `mode` | string | 否 | `"draft"`（默认）或 `"stable"` |

工具 SHALL 以用户视角调用 APP 的 HTTP 端点，涵盖：
- 数据库 REST API：`GET/POST/PUT/DELETE /db/{table}`
- TypeScript 函数：`ANY /functions/{name}`

返回 HTTP 响应的 status、headers 和 body。

#### Scenario: Agent 查询数据
- **WHEN** Agent 调用 `call_api(app_name: "todo", method: "GET", path: "/db/tasks")`
- **THEN** 工具 SHALL 返回 APP 的 `/db/tasks` API 响应

#### Scenario: Agent 调用函数
- **WHEN** Agent 调用 `call_api(app_name: "todo", method: "POST", path: "/functions/process", body: {"data": "test"})`
- **THEN** 工具 SHALL 返回函数的 HTTP 响应

#### Scenario: 默认 mode 为 draft
- **WHEN** Agent 调用 `call_api` 未指定 mode
- **THEN** 工具 SHALL 默认使用 draft 模式

### Requirement: 文件系统同步工作流

MCP 工具集 SHALL 支持文件系统同步工作流。

**核心原则：**
- Agent 在本地文件系统读写文件（使用自身的文件操作能力）
- MCP 工具负责在 Agent 工作目录与 cozybase 之间同步文件
- MCP 响应不返回文件内容，仅返回目录路径和文件列表

**推荐工作流：**
1. `create_app("todo")` 或 `fetch_app("todo")` — cozybase → Agent 工作目录同步
2. Agent 使用文件工具在工作目录中读写文件
3. `update_app("todo")` — Agent 工作目录 → cozybase 全量同步
4. `reconcile_app("todo")` — 重建 Draft 环境
5. `execute_sql` / `call_api` — 验证数据模型和 API 逻辑
6. `verify_app("todo")` — 验证可安全发布
7. `publish_app("todo")` — 发布到 Stable

对于小修改（仅修改一个文件），Agent 可使用 `update_app_file` 替代 `update_app`。

当 Agent 仅修改 UI 定义（`ui/pages.json`）时，不需要执行 reconcile / verify / publish 流程。工具描述 SHALL 明确告知 Agent 这一点。

#### Scenario: Agent 完整开发流程
- **WHEN** Agent 需要为 todo APP 添加新功能
- **THEN** Agent SHALL 依次：fetch_app → 在工作目录编辑文件 → update_app → reconcile_app → execute_sql/call_api 验证 → verify_app → publish_app

#### Scenario: Agent 单文件修改
- **WHEN** Agent 只修改了一个 function 文件
- **THEN** Agent SHALL 调用 update_app_file → reconcile_app

#### Scenario: Agent 仅修改 UI 定义
- **WHEN** Agent 只修改了 `ui/pages.json`
- **THEN** Agent SHALL 调用 update_app_file 即可，不需要 reconcile / verify / publish
