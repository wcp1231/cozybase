## 1. get_guide Handler 核心实现

- [x] 1.1 创建 `packages/daemon/src/mcp/guide-handler.ts`，实现 topic 路径解析逻辑（`{topic}.md` → `{topic}/index.md` → 错误）
- [x] 1.2 实现路径安全校验（仅允许字母、数字、连字符、`/`，阻止 `..` 和绝对路径）
- [x] 1.3 实现子 topic 自动发现（扫描目录下 `.md` 文件和子目录，追加 Subtopics 列表到返回内容末尾）
- [x] 1.4 实现 topic 不存在时的错误处理（返回可用顶级 topic 列表）

## 2. MCP Server 集成

- [x] 2.1 在 `server.ts` 中注册 `get_guide` 工具（`{ topic: z.string() }`），调用 guide-handler
- [x] 2.2 在 `mcp-types.ts` 中添加 `get_guide` 的 `TOOL_DESCRIPTIONS`（包含用途说明、顶级 topic 列表、层级路径示例）
- [x] 2.3 精简 `update_app_file` 描述，移除内嵌 UI 文档段，替换为 `get_guide('ui/components')` 交叉引用
- [x] 2.4 为 `create_app` 描述末尾追加 `get_guide('workflow')` 引用
- [x] 2.5 为 `reconcile_app` / `verify_app` / `publish_app` 描述末尾追加 `get_guide('db/migrations')` 引用

## 3. guides 文档编写

- [x] 3.1 创建 `packages/daemon/guides/` 目录结构（`workflow.md`、`functions.md`、`ui/`、`db/`）
- [x] 3.2 编写 `workflow.md` — 完整开发流程（create → edit → sync → reconcile → verify → publish）
- [x] 3.3 编写 `functions.md` — 函数编写指南（FunctionContext API、导出约定、返回值处理）
- [x] 3.4 编写 `ui/index.md` — UI 系统概述
- [x] 3.5 编写 `ui/components/index.md` — 26 个组件速查表
- [x] 3.6 编写 `ui/components/` 下各组件文档（table、form、dialog 等高频组件优先）
- [x] 3.7 编写 `ui/actions.md` — Action 系统（api/reload/dialog/link/close/confirm）
- [x] 3.8 编写 `ui/expressions.md` — 表达式引擎（`${...}` 语法、作用域）
- [x] 3.9 编写 `db/index.md` — 数据库概述
- [x] 3.10 编写 `db/crud.md` — 数据库 REST API 参考（路径、查询参数、操作符）
- [x] 3.11 编写 `db/migrations.md` — Migration 编写模式（SQLite 语法、命名规则、immutable 机制）

## 4. Workspace 模板文件

- [x] 4.1 创建 `packages/daemon/templates/workspace/` 目录
- [x] 4.2 编写 `templates/workspace/AGENT.md`（平台概述、开发流程、APP 目录结构、get_guide topic 索引、Skills 列表，控制在 200 行内）
- [x] 4.3 编写 `templates/workspace/.claude/skills/create-app/SKILL.md`（从零创建 APP 的引导流程）
- [x] 4.4 编写 `templates/workspace/.claude/skills/add-function/SKILL.md`（添加函数的引导流程）
- [x] 4.5 编写 `templates/workspace/.claude/skills/add-page/SKILL.md`（添加 UI 页面的引导流程）
- [x] 4.6 编写 `templates/workspace/.claude/skills/modify-schema/SKILL.md`（修改数据库 schema 的引导流程）

## 5. cozybase init 命令

- [x] 5.1 创建 `packages/daemon/src/workspace-init.ts`，实现模板复制逻辑（不覆盖已存在文件，输出创建/跳过状态）
- [x] 5.2 在 `cli.ts` 中添加 `init` 子命令分支，解析 `--apps-dir` 参数，调用 workspace-init 模块
- [x] 5.3 更新 `printHelp()` 帮助信息，添加 `init` 子命令说明
