# CLI Entry (Delta)

## ADDED Requirements

### Requirement: init 子命令

系统 SHALL 新增 `init` 子命令，用于初始化 Agent Workspace 目录。

`cli.ts` 的子命令路由 SHALL 新增 `init` 分支，调用 workspace 初始化模块。

```
cozybase init [--apps-dir <path>]
```

#### Scenario: 执行 init 命令

- **WHEN** 用户执行 `cozybase init`
- **THEN** 系统 SHALL 调用 workspace 初始化逻辑，将模板文件复制到目标目录

#### Scenario: init 带 --apps-dir 参数

- **WHEN** 用户执行 `cozybase init --apps-dir /path/to/workspace`
- **THEN** 系统 SHALL 使用 `/path/to/workspace` 作为目标目录执行初始化

## MODIFIED Requirements

### Requirement: CLI 子命令路由

系统 SHALL 提供统一入口 `cli.ts`，根据第一个 positional 参数分发到对应子命令：

- `daemon` → daemon 进程管理（支持 start/stop/restart/status 子命令）
- `mcp` → 启动 MCP Server
- `init` → 初始化 Agent Workspace 目录

未识别的子命令或无参数时 SHALL 显示帮助信息。

#### Scenario: 启动 daemon（默认 start）

- **WHEN** 用户执行 `cozybase daemon`
- **THEN** 系统启动 HTTP 服务（等同于 `cozybase daemon start`）

#### Scenario: 启动 daemon 并传递参数

- **WHEN** 用户执行 `cozybase daemon start --port 8080 --workspace ~/my-ws`
- **THEN** 系统启动 HTTP 服务，监听 8080 端口，使用指定 workspace

#### Scenario: 启动 MCP Server

- **WHEN** 用户执行 `cozybase mcp`
- **THEN** 系统启动 MCP Server（embedded 模式），行为与直接运行 `src/mcp/mcp-entry.ts` 一致

#### Scenario: 启动 MCP Server（remote 模式）

- **WHEN** 用户执行 `cozybase mcp --url http://localhost:3000`
- **THEN** 系统启动 MCP Server（remote 模式），连接到指定 daemon

#### Scenario: 初始化 Workspace

- **WHEN** 用户执行 `cozybase init`
- **THEN** 系统初始化当前目录为 Agent Workspace，复制模板文件

#### Scenario: 未识别的子命令

- **WHEN** 用户执行 `cozybase foo`
- **THEN** 系统显示帮助信息并以非零退出码退出

### Requirement: 帮助信息

系统 SHALL 在以下情况显示帮助信息：

- 执行 `cozybase --help` 或 `cozybase -h`
- 执行 `cozybase` 无任何参数
- 执行未识别的子命令

帮助信息 SHALL 包含：版本号、项目描述、可用子命令列表及其简要说明、全局选项列表。帮助信息 SHALL 包含 `init` 子命令的说明。

#### Scenario: 显示帮助

- **WHEN** 用户执行 `cozybase --help`
- **THEN** 系统输出帮助信息到 stdout，包含 `daemon`、`mcp` 和 `init` 子命令说明，然后以退出码 0 退出

#### Scenario: 无参数时显示帮助

- **WHEN** 用户执行 `cozybase`（无任何参数）
- **THEN** 系统输出帮助信息到 stdout
