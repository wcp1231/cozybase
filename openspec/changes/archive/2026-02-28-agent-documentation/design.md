## Context

当前 AI Agent 通过 MCP 连接 Cozybase 时，唯一的知识来源是 11 个 MCP 工具的描述文本（存储在 `mcp-types.ts` 的 `TOOL_DESCRIPTIONS` 中）。这些描述加起来约 60 行，不足以指导 Agent 完成完整的 APP 开发。其中 `update_app_file` 的描述已经开始内嵌 UI 组件文档（约 15 行），说明当前架构无法满足文档投递需求。

同时，Agent 的工作目录（`--apps-dir`）是一个天然的文档投递点。如果 Cozybase 能在这个目录下放置 `AGENT.md` 和 Skills 文件，支持 Claude Code 等 Agent 平台自动加载，就能建立一个分层的知识体系。

## Goals / Non-Goals

**Goals:**

- 让 AI Agent 能按需获取 APP 开发所需的参考文档（函数 API、UI 组件 schema、数据库操作等）
- 在 Agent Workspace 目录提供 AGENT.md 和 Skills，帮助 Agent 建立全局认知框架
- 提供 `cozybase init` 命令初始化 Workspace，scaffold 所有 Agent 辅助文件
- 精简现有 MCP 工具描述，避免在工具描述中内嵌大段文档

**Non-Goals:**

- 不为每种 Agent 平台（Cursor、Windsurf 等）生成专属配置文件，初期仅支持 Claude Code 的 AGENT.md + Skills
- 不自动生成 guides 内容——所有 guide 文档手写，确保质量
- 不修改现有 MCP 工具的功能行为，仅调整描述文本
- 不涉及 MCP Resources 或 MCP Prompts 的实现

## Decisions

### Decision 1: 三层文档投递架构

采用 AGENT.md + Skills + `get_guide(topic)` 三层协作架构：

| 层级 | 加载方式 | 内容定位 | 大小 |
|------|---------|---------|------|
| AGENT.md | Agent 自动加载 | 全局认知：平台概述、开发流程、工具索引 | ~200 行 |
| Skills | 用户按需触发 | 引导式工作流：从零创建 APP、添加函数等 | 每个 ~100 行 |
| `get_guide(topic)` | Agent 自行调用 MCP 工具 | 详细参考：组件 schema、API 文档 | 每个 ~200-400 行 |

**为什么不只用 get_guide**：Agent 首次使用时不知道有 `get_guide` 工具可用。AGENT.md 作为自动加载的入口，教会 Agent：1) 平台是什么；2) 开发流程怎么走；3) 需要详细参考时调用 `get_guide(topic)`。

**为什么不只用 AGENT.md**：AGENT.md 每次对话都加载，内容必须精简。26 个 UI 组件的完整 schema 放在 AGENT.md 会浪费大量 context token。

### Decision 2: 层级化 topic 路径

`get_guide(topic)` 使用 `/` 分隔的层级路径，而非扁平枚举：

```
get_guide('ui')                     → UI 系统概述
get_guide('ui/components')          → 26 个组件速查表
get_guide('ui/components/table')    → table 组件完整参考
```

topic 参数类型为 `z.string()`，不使用 `z.enum()`。无效路径返回错误信息加可用路径列表。

每层返回的内容末尾自动列出可用的子 topic，引导 Agent 逐层钻取。

**备选方案：扁平 enum**（如 `'ui-components'`, `'ui-actions'`）。否决原因：26 个组件不适合一次性返回，扁平结构无法支持按单个组件粒度获取文档。

**Topic 树：**

```
workflow                    — 开发流程
functions                   — 函数编写（FunctionContext API、导出约定、返回值）
ui                          — UI 系统概述
├── ui/components           — 组件速查
│   ├── ui/components/page
│   ├── ui/components/table
│   ├── ui/components/form
│   └── ui/components/<name>  (每个组件)
├── ui/actions              — Action 系统
└── ui/expressions          — 表达式引擎
db                          — 数据库概述
├── db/crud                 — REST API
└── db/migrations           — Migration 编写
```

### Decision 3: Guide 文件组织——约定式路径映射

`guides/` 目录结构直接映射 topic 路径，无需配置文件：

```
packages/daemon/guides/
├── workflow.md                → get_guide('workflow')
├── functions.md               → get_guide('functions')
├── ui/
│   ├── index.md               → get_guide('ui')
│   ├── actions.md             → get_guide('ui/actions')
│   ├── expressions.md         → get_guide('ui/expressions')
│   └── components/
│       ├── index.md           → get_guide('ui/components')
│       ├── table.md           → get_guide('ui/components/table')
│       ├── form.md            → get_guide('ui/components/form')
│       └── ...
└── db/
    ├── index.md               → get_guide('db')
    ├── crud.md                → get_guide('db/crud')
    └── migrations.md          → get_guide('db/migrations')
```

路径解析规则：
1. `topic` → 尝试 `guides/{topic}.md`
2. 若不存在 → 尝试 `guides/{topic}/index.md`
3. 都不存在 → 返回错误 + 可用 topic 列表（扫描 guides/ 目录）

新增文档只需放置 markdown 文件，handler 自动发现。

**子 topic 列表生成**：handler 扫描当前 topic 对应目录下的文件和子目录，自动在返回内容末尾追加 `## Subtopics` 列表。

**备选方案：JSON 注册表**。否决原因：增加维护成本，且 guides 的变更频率较低，约定式映射足够。

### Decision 4: Guide 文件通过 import.meta.dir 定位

MCP Server 在运行时通过 `import.meta.dir` 相对定位 `guides/` 目录（`resolve(import.meta.dir, '../../guides/')`），无需额外配置。这与现有 `templates/welcome/` 的定位方式一致。

Guide 文件在每次 `get_guide` 调用时从磁盘读取（`readFileSync`），不做内存缓存。原因：guide 文件数量少、体积小，读取开销可忽略；且开发阶段修改 guide 后无需重启 MCP Server。

### Decision 5: Workspace 初始化命令

新增 `cozybase init` CLI 子命令：

```bash
$ cozybase init [--apps-dir <path>]
```

行为：
1. 确定目标目录：`--apps-dir` 参数 → `COZYBASE_APPS_DIR` 环境变量 → `process.cwd()`
2. 检查目录下是否已有 `AGENT.md`，如已存在则跳过（不覆盖用户修改）
3. 从 `templates/workspace/` 复制模板文件到目标目录
4. 输出已创建的文件列表

模板文件列表：
- `AGENT.md` — 平台概述、开发流程、`get_guide(topic)` 索引
- `.claude/skills/create-app/SKILL.md` — 从零创建 APP 的引导流程
- `.claude/skills/add-function/SKILL.md` — 为现有 APP 添加函数
- `.claude/skills/add-page/SKILL.md` — 为现有 APP 添加 UI 页面
- `.claude/skills/modify-schema/SKILL.md` — 修改数据库 schema

### Decision 6: 精简现有工具描述

`update_app_file` 中内嵌的 UI 文档段（约 15 行）替换为一行交叉引用：

```
"For UI component reference and schema, call get_guide('ui/components')."
```

其他工具描述在末尾添加相关 guide 引用，例如：
- `create_app`: 添加 `"For the complete development workflow, call get_guide('workflow')."`
- `reconcile_app` / `verify_app` / `publish_app`: 添加 `"For migration patterns, call get_guide('db/migrations')."`

### Decision 7: get_guide 工具描述

`get_guide` 的 MCP tool description 需要足够详细，让 Agent 知道何时调用：

```
Get detailed reference documentation for Cozybase APP development.

Use this tool when you need specific guidance on:
- Development workflow (create → edit → sync → reconcile → verify → publish)
- Writing TypeScript functions (FunctionContext API, exports, return values)
- UI component schemas and usage
- Action system and expression engine
- Database REST API and migration patterns

Pass a topic path to get documentation at that level:
- 'workflow' — Complete development workflow
- 'functions' — Function writing guide
- 'ui' — UI system overview (subtopics: ui/components, ui/actions, ui/expressions)
- 'db' — Database overview (subtopics: db/crud, db/migrations)

Use '/' to drill into subtopics (e.g. 'ui/components/table' for table schema).
```

## Risks / Trade-offs

**[Agent 不调用 get_guide] → AGENT.md 中明确列出 topic 索引并指引 Agent 使用；工具交叉引用也提供二次提醒**

**[Guide 内容维护成本] → Guide 是手写的独立 markdown 文件，与代码解耦。变更频率低（仅功能变化时需更新）。约定式路径映射避免额外配置开销**

**[AGENT.md 和 Skills 仅支持 Claude Code] → 初期可接受。AGENT.md 正在成为多平台约定（Cursor 等也开始支持类似机制）。核心知识通过 MCP 工具 get_guide 投递，不依赖特定 Agent 平台**

**[子 topic 发现需要额外调用] → 每层返回内容中自动列出子 topic，Agent 可在一次调用中获取概述 + 子 topic 列表，减少不必要的钻取**
