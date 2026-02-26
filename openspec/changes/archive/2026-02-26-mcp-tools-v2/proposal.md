# MCP Tools v2：文件系统同步模型 + 完整开发工作流

## 背景

当前 MCP 工具定义（`mcp-types.ts` + `specs/mcp-tools/spec.md`）覆盖了 6 个 App 管理工具，基于 Checkout-Edit-Push 工作流，Agent 通过 MCP 参数传递文件内容进行操作。

### 现有问题

1. **工作流不完整**：Agent 能编辑文件，但无法触发 reconcile / verify / publish，无法走完开发到发布的完整流程。

2. **缺少运行时交互**：Agent 无法查询数据库、调用函数端点，只能"盲写"代码，无法验证结果。

3. **内容传递模式的一致性风险**：Agent 通过 MCP 参数传递文件内容（字符串），导致 Agent 上下文中的内容、MCP 参数中的内容、DB 中的内容存在三份拷贝，可能不一致。

4. **不符合 Agent 的自然工作方式**：AI Agent 天然擅长读写文件（所有 MCP Host 都有文件操作能力），但当前模型要求 Agent 把文件内容塞进 MCP 工具参数，不够自然。

## 核心设计变更

### 变更 1：`cozybase mcp` — 统一 MCP 入口

提供 `cozybase mcp` CLI 命令作为 MCP Server 入口，支持两种部署模式：

```bash
# 本地模式（嵌入式，直接调用内部模块）
cozybase mcp

# 远程模式（连接 Homelab 等远程 cozybase）
cozybase mcp --url http://homelab.local:2765
```

`cozybase mcp` 始终运行在 Agent 所在的机器上（作为 Agent 的 MCP stdio 子进程），负责：
- 处理 MCP 协议（stdio 传输）
- 管理 Agent 本地工作目录（读写文件）
- 与 cozybase 核心交互（本地直接调用或远程 HTTP API）

```
┌──────────┐  stdio    ┌─────────────────────────────────┐
│  Agent   │◄────────▶│  cozybase mcp (Agent 本地进程)   │
└──────────┘           │                                 │
                       │  MCP Tool Handlers              │
     Agent 工作目录     │  ├── File I/O (本地读写)        │
     {apps_dir}/       │  └── Backend Adapter:           │
     ├── todo-app/     │      ├── Embedded (本地模式)     │ ← 直接调用内部模块
     └── blog-app/     │      └── Remote (远程模式)       │ ← HTTP API
                       └────────────────┬────────────────┘
                                        │
                          本地: 直接访问 platform.sqlite
                          远程: HTTP → cozybase daemon (Homelab)
```

### 变更 2：文件系统作为 Agent 的工作界面

**从** "Agent 通过 MCP 参数传递文件内容" **改为** "Agent 在本地文件系统读写文件，MCP 工具负责同步"。

**两个独立的目录概念：**

- **cozybase 数据目录**（`~/.cozybase/`）：cozybase 自身管理的空间，存放 `platform.sqlite`、App 数据库和运行时文件。Agent 无需也不应该直接操作此目录。
- **Agent 工作目录**（`{apps_dir}/`）：Agent 侧的文件系统目录。位置通过 `cozybase mcp` 配置指定，与 `~/.cozybase/` 无关。cozybase 和 Agent 可能在同一台机器，也可能不在。

```
旧模型：
  Agent 内存 ──content参数──▶ MCP Tool ──写入──▶ platform.sqlite

新模型：
  Agent ──写文件──▶ Agent 工作目录 ◀──cozybase mcp 同步──▶ cozybase 核心
```

- `create_app` 和 `fetch_app` 执行 cozybase → Agent 方向的同步（提取文件到 Agent 工作目录）
- `update_app` 和 `update_app_file` 执行 Agent → cozybase 方向的同步（上传文件到 cozybase）
- Agent 使用自身的文件读写能力操作工作目录中的文件

### 变更 3：移除乐观锁（base_version）

**从** `update_app(app_name, base_version, files[])` **改为** `update_app(app_name)`。

设计前提：每个 APP 由单个 Agent 操作，不存在多 Agent 并发修改同一 APP 的场景。多 Agent 场景下，各 Agent 操作不同的 APP。

移除 `base_version` 后：
- `update_app` 不再需要文件列表参数，`cozybase mcp` 直接从工作目录读取
- `update_app_file` 不再需要文件内容参数，`cozybase mcp` 直接从工作目录读取指定文件
- 无需处理版本冲突，简化 Agent 的工具使用逻辑

### 变更 4：补全开发工作流工具

新增 3 个工具，对应已有的 Draft 管理能力：

| 工具 | 作用 |
|------|------|
| `reconcile_app` | 重建 Draft 环境（DB + seeds + functions） |
| `verify_app` | 验证变更可安全发布到 Stable |
| `publish_app` | 发布到 Stable，migration 变为 immutable |

### 变更 5：新增运行时交互工具

新增 2 个工具，让 Agent 拥有两个互补的视角：

| 工具 | 视角 | 作用 |
|------|------|------|
| `execute_sql` | 开发者视角 | 直接操作数据库，验证 schema 和数据 |
| `call_api` | 用户视角 | 调用 APP 的 HTTP 端点，模拟真实用户请求 |

`execute_sql` 的权限模型：
- **Draft 模式**：允许 SELECT 和 DML（INSERT/UPDATE/DELETE）。Draft 数据库是临时的，`reconcile_app` 可随时重建。
- **Stable 模式**：仅允许 SELECT。数据修改必须通过 APP 的 API 端点。
- **DDL 一律禁止**：Schema 变更必须通过 migration 文件。

`call_api` 覆盖 APP 的所有 HTTP 端点：
- 数据库 REST API：`GET/POST/PUT/DELETE /db/{table}`
- TypeScript 函数：`ANY /functions/{name}`

## 完整工具清单

```
总计: 11 个工具

Layer 1 — App 生命周期 (4)
  ├── create_app(name, description?)        创建 APP，提取模板到 Agent 工作目录
  ├── list_apps()                           列出所有 APP
  ├── fetch_app(app_name)                   cozybase → Agent 工作目录，返回文件列表
  └── delete_app(app_name)                  删除 APP 及所有数据

Layer 2 — 文件同步 (2)
  ├── update_app(app_name)                  Agent 工作目录 → cozybase（全量同步）
  └── update_app_file(app_name, path)       Agent 工作目录单文件 → cozybase

Layer 3 — 开发工作流 (3)
  ├── reconcile_app(app_name)               重建 Draft 环境（DB + seeds + functions）
  ├── verify_app(app_name)                  验证变更可安全发布
  └── publish_app(app_name)                 发布到 Stable

Layer 4 — 运行时交互 (2)
  ├── execute_sql(app_name, sql, mode?)     开发者视角：操作数据库
  └── call_api(app_name, method, path,      用户视角：调用 APP HTTP 端点
               body?, mode?)
```

## Agent 完整工作流

```
1. create_app("todo")               创建 APP，模板文件出现在 Agent 工作目录
          │
2. Agent 读写工作目录中的文件        用自身的文件读写能力编辑文件
          │
3. update_app("todo")               一键同步所有文件到 cozybase
          │
4. reconcile_app("todo")            重建 Draft 环境
          │
     ┌────┴─── 失败？修改文件 → 回到 2
     │
5. execute_sql / call_api           验证数据模型和 API 逻辑
          │
     ┌────┴─── 不满意？修改文件 → 回到 2
     │
6. verify_app("todo")               验证可安全发布
          │
7. publish_app("todo")              发布到 Stable
```

## 与现有 Spec 的差异

| 维度 | 现有 Spec | 本次变更 |
|------|-----------|---------|
| MCP 入口 | 未定义 | `cozybase mcp` CLI 命令，支持本地/远程两种模式 |
| 文件传递方式 | MCP 参数传递 content | Agent 本地文件系统读写 + `cozybase mcp` 同步 |
| update_app 参数 | app_name, base_version, files[] | app_name |
| update_app_file 参数 | app_name, path, content | app_name, path |
| 乐观锁 | 有（base_version） | 无（单 Agent 模型） |
| 开发工作流工具 | 在 spec 表中提及但未定义接口 | 完整定义 reconcile / verify / publish |
| 运行时交互 | 在 spec 表中提及但未定义接口 | 完整定义 execute_sql / call_api |

## 涉及的 Capability 变更

| Capability | 变更类型 |
|-----------|---------|
| `mcp-tools` | 重大更新：工具接口重新设计，新增 `cozybase mcp` 入口 |
| `management-api` | 扩展：新增 SQL 查询端点 |

## 不在范围内

- **Cron / Trigger 等未来函数类型的测试工具**：等功能实现后再设计
- **多 Agent 并发操作同一 APP**：当前设计假设单 Agent 模型
- **UI 操作能力**（模拟用户在 UI 上的交互）：属于未来扩展

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Agent 修改文件但忘了调用 update_app | Agent 工作目录和 cozybase 不一致 | 工具描述中明确提示同步步骤 |
| execute_sql 在 Draft 允许 DML | 数据被改坏 | Draft 可通过 reconcile 重建，无伤害 |
| DDL 检查被绕过 | Schema 与 migration 不一致 | 服务端用 SQL 语句关键字白名单检查 |
| delete_app 误操作 | 数据不可恢复 | 工具描述中加强警告 |
| 工作目录与 cozybase 状态不同步 | Agent 看到过期文件 | fetch_app 总是从 cozybase 刷新到 Agent 工作目录 |
| 远程模式网络中断 | 同步和工作流操作失败 | 文件读写是本地操作不受影响，MCP 工具返回清晰错误信息 |
