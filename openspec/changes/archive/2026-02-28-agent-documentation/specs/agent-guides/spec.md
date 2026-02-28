# Agent Guides

## Purpose

提供面向 AI Agent 的层级化参考文档体系，包含 `get_guide(topic)` MCP 工具和 `guides/` 内容文件的组织结构与加载机制。Agent 通过调用此工具按需获取 APP 开发的详细参考文档。

## ADDED Requirements

### Requirement: get_guide MCP 工具

系统 SHALL 提供 `get_guide` MCP 工具，接受以下参数：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `topic` | string | 是 | 文档 topic 路径，使用 `/` 分隔层级 |

工具 SHALL 根据 topic 路径查找对应的 markdown 文件并返回其内容。

#### Scenario: 查询顶级 topic

- **WHEN** Agent 调用 `get_guide(topic: "workflow")`
- **THEN** 工具 SHALL 返回 `guides/workflow.md` 的内容

#### Scenario: 查询带层级的 topic

- **WHEN** Agent 调用 `get_guide(topic: "ui/components/table")`
- **THEN** 工具 SHALL 返回 `guides/ui/components/table.md` 的内容

#### Scenario: 查询目录级 topic

- **WHEN** Agent 调用 `get_guide(topic: "ui")`
- **THEN** 工具 SHALL 返回 `guides/ui/index.md` 的内容

### Requirement: topic 路径解析规则

系统 SHALL 按以下优先级解析 topic 路径到 markdown 文件：

1. `guides/{topic}.md` — 直接匹配文件
2. `guides/{topic}/index.md` — 目录的 index 文件
3. 都不存在 → 返回错误

路径解析 SHALL 阻止路径遍历攻击（如 `../` 或绝对路径）。topic 路径 SHALL 仅允许字母、数字、连字符和 `/` 字符。

#### Scenario: 直接文件匹配优先

- **WHEN** `guides/functions.md` 和 `guides/functions/index.md` 都存在，Agent 调用 `get_guide(topic: "functions")`
- **THEN** 工具 SHALL 返回 `guides/functions.md` 的内容（直接匹配优先）

#### Scenario: 回退到 index 文件

- **WHEN** `guides/ui.md` 不存在但 `guides/ui/index.md` 存在，Agent 调用 `get_guide(topic: "ui")`
- **THEN** 工具 SHALL 返回 `guides/ui/index.md` 的内容

#### Scenario: topic 不存在

- **WHEN** Agent 调用 `get_guide(topic: "nonexistent")`
- **THEN** 工具 SHALL 返回错误消息，包含所有可用的顶级 topic 列表

#### Scenario: 路径遍历防御

- **WHEN** Agent 调用 `get_guide(topic: "../../../etc/passwd")`
- **THEN** 工具 SHALL 返回错误消息，拒绝非法路径

### Requirement: 子 topic 自动发现

当 topic 对应一个目录（即通过 `index.md` 解析）时，工具 SHALL 在返回内容末尾自动追加子 topic 列表。

子 topic 列表 SHALL 通过扫描该目录下的 `.md` 文件和子目录生成。格式为：

```
---
Subtopics:
- {topic}/{name} — {name}
```

子目录的 `index.md` 中的第一个 `#` 标题行 MAY 用作子 topic 的描述。

#### Scenario: 列出子 topic

- **WHEN** Agent 调用 `get_guide(topic: "ui")`，且 `guides/ui/` 目录下有 `components/`、`actions.md`、`expressions.md`
- **THEN** 返回内容末尾 SHALL 包含子 topic 列表：`ui/components`、`ui/actions`、`ui/expressions`

#### Scenario: 叶子节点无子 topic

- **WHEN** Agent 调用 `get_guide(topic: "ui/components/table")`，且 `guides/ui/components/table.md` 是普通文件（非目录）
- **THEN** 返回内容 SHALL 不包含子 topic 列表

### Requirement: guides 目录结构

`guides/` 目录 SHALL 位于 `packages/daemon/guides/`，其目录结构直接映射 topic 路径。

初始 topic 树 SHALL 包含以下文件：

```
packages/daemon/guides/
├── workflow.md
├── functions.md
├── ui/
│   ├── index.md
│   ├── actions.md
│   ├── expressions.md
│   └── components/
│       ├── index.md
│       └── (每个组件一个 .md 文件)
└── db/
    ├── index.md
    ├── crud.md
    └── migrations.md
```

新增 guide 文档 SHALL 仅需放置 markdown 文件到对应路径，handler 自动发现，无需额外注册配置。

#### Scenario: 新增 guide 无需改代码

- **WHEN** 开发者在 `guides/ui/components/` 下新增 `dialog.md`
- **THEN** Agent 调用 `get_guide(topic: "ui/components/dialog")` SHALL 返回该文件内容，无需修改任何代码

### Requirement: guides 目录定位

MCP Server SHALL 通过 `import.meta.dir` 相对定位 `guides/` 目录，路径为 `resolve(import.meta.dir, '../../guides/')`。

Guide 文件 SHALL 在每次 `get_guide` 调用时从磁盘读取，不做内存缓存。

#### Scenario: MCP Server 定位 guides

- **WHEN** MCP Server 启动并收到 `get_guide` 调用
- **THEN** handler SHALL 从 `packages/daemon/guides/` 目录读取对应文件

### Requirement: get_guide 工具描述

`get_guide` 的 MCP tool description SHALL 包含以下信息：

1. 工具用途说明（何时使用）
2. 可用的顶级 topic 列表及简要说明
3. 层级路径用法示例

description SHALL 足够详细，使 Agent 无需外部指引即可知道何时调用此工具和传递什么参数。

#### Scenario: Agent 通过工具描述理解用法

- **WHEN** Agent 查看 `get_guide` 工具的 description
- **THEN** description SHALL 列出所有顶级 topic（`workflow`、`functions`、`ui`、`db`）及其子 topic 概要，并说明使用 `/` 钻取子主题
