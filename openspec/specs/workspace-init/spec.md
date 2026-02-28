# Workspace Init

## Purpose

提供 `cozybase init` CLI 子命令，初始化 Agent Workspace 目录，scaffold AGENT.md 和 Skills 模板文件，帮助 AI Agent 建立对 Cozybase 平台的全局认知框架。

## Requirements

### Requirement: cozybase init 命令

系统 SHALL 提供 `cozybase init` CLI 子命令，初始化 Agent Workspace 目录。

```bash
cozybase init [--apps-dir <path>]
```

目标目录确定优先级（从高到低）：
1. `--apps-dir` 参数
2. `COZYBASE_APPS_DIR` 环境变量
3. `process.cwd()`

命令 SHALL 从 `templates/workspace/` 复制模板文件到目标目录，完成后输出已创建的文件列表。

#### Scenario: 初始化当前目录

- **WHEN** 用户在 `/home/user/project` 下执行 `cozybase init`
- **THEN** 系统 SHALL 将 `templates/workspace/` 中的模板文件复制到 `/home/user/project/`，输出已创建的文件列表

#### Scenario: 指定目标目录

- **WHEN** 用户执行 `cozybase init --apps-dir /home/user/workspace`
- **THEN** 系统 SHALL 将模板文件复制到 `/home/user/workspace/`

#### Scenario: 通过环境变量指定目录

- **WHEN** 设置 `COZYBASE_APPS_DIR=/home/user/workspace` 并执行 `cozybase init`（未指定 `--apps-dir`）
- **THEN** 系统 SHALL 使用 `/home/user/workspace/` 作为目标目录

### Requirement: 文件不覆盖策略

`cozybase init` SHALL 不覆盖目标目录中已存在的文件。对于已存在的文件，SHALL 跳过并在输出中标注"skipped"。

#### Scenario: 已存在 AGENT.md

- **WHEN** 目标目录已有 `AGENT.md`，用户执行 `cozybase init`
- **THEN** 系统 SHALL 跳过 `AGENT.md`（不覆盖），输出提示该文件已存在并被跳过

#### Scenario: 首次初始化

- **WHEN** 目标目录为空目录，用户执行 `cozybase init`
- **THEN** 系统 SHALL 创建所有模板文件，无跳过

#### Scenario: 重复初始化

- **WHEN** 目标目录已通过 `cozybase init` 初始化过，用户再次执行 `cozybase init`
- **THEN** 系统 SHALL 跳过所有已存在的文件，输出全部标注为"skipped"

### Requirement: Workspace 模板文件

`templates/workspace/` 目录 SHALL 包含以下模板文件：

| 文件路径 | 说明 |
|---------|------|
| `AGENT.md` | 平台概述、开发流程、MCP 工具索引、`get_guide(topic)` 说明 |
| `.claude/skills/create-app/SKILL.md` | 从零创建 APP 的引导式工作流 |
| `.claude/skills/add-function/SKILL.md` | 为现有 APP 添加函数的引导流程 |
| `.claude/skills/add-page/SKILL.md` | 为现有 APP 添加 UI 页面的引导流程 |
| `.claude/skills/modify-schema/SKILL.md` | 修改数据库 schema 的引导流程 |

#### Scenario: 模板文件完整性

- **WHEN** 执行 `cozybase init` 在空目录
- **THEN** SHALL 创建 `AGENT.md` 和 `.claude/skills/` 下的 4 个 SKILL.md 文件

### Requirement: AGENT.md 内容结构

`AGENT.md` 模板 SHALL 包含以下章节：

1. **你在哪** — Cozybase 平台简介（1-2 段）
2. **你能做什么** — 核心能力列表
3. **开发流程** — create → edit → sync → reconcile → verify → publish 流程概要
4. **APP 目录结构** — 标准 APP 子目录说明
5. **详细参考** — `get_guide(topic)` 的完整 topic 索引，列出所有顶级和二级 topic
6. **可用 Skills** — Skills 列表及触发方式

AGENT.md SHALL 控制在 200 行以内，聚焦"认知框架"而非"完整手册"。

#### Scenario: Agent 通过 AGENT.md 了解 get_guide

- **WHEN** Agent 加载 AGENT.md
- **THEN** 文件中 SHALL 包含 `get_guide(topic)` 的完整 topic 索引，Agent 可据此判断需要调用哪个 topic

#### Scenario: AGENT.md 自动加载

- **WHEN** Claude Code Agent 在已初始化的 Workspace 目录中工作
- **THEN** Agent SHALL 自动加载 `AGENT.md`，获得 Cozybase 平台的全局认知

### Requirement: Skills 模板内容

每个 Skill 模板 SHALL 是一个引导式工作流，包含：

1. 触发条件说明
2. 分步骤引导（每步包含要执行的 MCP 工具调用）
3. 在需要详细参考时引用 `get_guide(topic)`

Skills SHALL 聚焦"引导 Agent 走完流程"，具体 API 参考交给 `get_guide(topic)`。

#### Scenario: create-app skill 引导完整流程

- **WHEN** 用户触发 `/create-app` skill
- **THEN** Skill SHALL 引导 Agent 完成 create_app → 编写 migration → 编写 function → 编写 UI → update_app → reconcile → verify → publish 的完整流程

#### Scenario: skill 引用 get_guide

- **WHEN** Agent 执行 add-function skill 的"编写函数"步骤
- **THEN** Skill SHALL 指引 Agent 调用 `get_guide('functions')` 获取 FunctionContext API 参考

### Requirement: templates/workspace 目录位置

Workspace 模板文件 SHALL 存放在 `packages/daemon/templates/workspace/` 目录下，与现有的 `templates/welcome/`（APP 模板）平级。

#### Scenario: 模板目录结构

- **WHEN** 查看 `packages/daemon/templates/` 目录
- **THEN** SHALL 包含 `welcome/`（APP 模板）和 `workspace/`（Workspace 模板）两个子目录
