# CLI Entry

## Purpose

Provide a unified CLI entry point (`cli.ts`) for CozyBase, routing subcommands to their respective handlers (daemon process management, MCP server), displaying help/version information, and managing daemon lifecycle via PID files and control subcommands.

## Requirements

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

### Requirement: 版本显示

系统 SHALL 支持 `--version` 和 `-v` 选项，输出当前版本号。版本号 SHALL 从 `package.json` 的 `version` 字段读取，不硬编码。

#### Scenario: 显示版本号

- **WHEN** 用户执行 `cozybase --version`
- **THEN** 系统输出 `cozybase v<version>` 格式的版本字符串（如 `cozybase v0.1.0`）

#### Scenario: 短选项显示版本号

- **WHEN** 用户执行 `cozybase -v`
- **THEN** 系统输出与 `--version` 相同的版本字符串

### Requirement: bin 注册

`packages/server/package.json` SHALL 声明 `"bin": { "cozybase": "./src/cli.ts" }`，使得 `bun install` 后项目内可通过 `bun run cozybase` 调用 CLI。

`cli.ts` 文件 SHALL 包含 `#!/usr/bin/env bun` shebang 行。

#### Scenario: 项目内可用

- **WHEN** 在项目根目录执行 `bun install`
- **THEN** `node_modules/.bin/cozybase` 链接到 `packages/server/src/cli.ts`，执行 `bun run cozybase --version` 正常输出版本号

### Requirement: daemon PID 文件管理

daemon 启动时 SHALL 在 workspace 目录写入 `daemon.pid`（包含进程 PID）和 `daemon.port`（包含监听端口号）。daemon 进程退出时（SIGINT/SIGTERM）SHALL 自动删除这两个文件。

#### Scenario: 启动时写入 PID 文件

- **WHEN** daemon 成功启动
- **THEN** `{workspaceDir}/daemon.pid` 包含当前进程 PID，`{workspaceDir}/daemon.port` 包含监听端口号

#### Scenario: 正常退出时清理

- **WHEN** daemon 收到 SIGINT 或 SIGTERM 信号
- **THEN** daemon 删除 `daemon.pid` 和 `daemon.port` 文件后退出

### Requirement: daemon status 子命令

`cozybase daemon status` SHALL 显示 daemon 的运行状态。

状态信息 SHALL 包含：运行状态（running/stopped）、PID（如运行中）、端口号（如运行中）、workspace 路径。

#### Scenario: daemon 正在运行

- **WHEN** 用户执行 `cozybase daemon status` 且 daemon 正在运行
- **THEN** 系统输出 daemon 的 PID、端口号、workspace 路径，并以退出码 0 退出

#### Scenario: daemon 未运行

- **WHEN** 用户执行 `cozybase daemon status` 且 daemon 未运行
- **THEN** 系统输出 "cozybase daemon is not running"，并以退出码 1 退出

#### Scenario: PID 文件残留但进程已死

- **WHEN** PID 文件存在但对应进程已不存在
- **THEN** 系统输出 "cozybase daemon is not running"（视为未运行），清理残留的 PID 文件

### Requirement: daemon stop 子命令

`cozybase daemon stop` SHALL 停止运行中的 daemon 进程。

#### Scenario: 成功停止

- **WHEN** 用户执行 `cozybase daemon stop` 且 daemon 正在运行
- **THEN** 系统向 daemon 进程发送 SIGTERM 信号，等待进程退出，输出 "cozybase daemon stopped"

#### Scenario: daemon 未运行时 stop

- **WHEN** 用户执行 `cozybase daemon stop` 且 daemon 未运行
- **THEN** 系统输出 "cozybase daemon is not running"，以退出码 1 退出

### Requirement: daemon restart 子命令

`cozybase daemon restart` SHALL 先停止运行中的 daemon，然后重新启动。

#### Scenario: 成功重启

- **WHEN** 用户执行 `cozybase daemon restart` 且 daemon 正在运行
- **THEN** 系统先停止现有 daemon，然后启动新的 daemon 实例

#### Scenario: daemon 未运行时 restart

- **WHEN** 用户执行 `cozybase daemon restart` 且 daemon 未运行
- **THEN** 系统直接启动 daemon（等同于 start）
