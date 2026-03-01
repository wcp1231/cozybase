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

#### Scenario: 启动 MCP Server（本地 daemon 运行中）

- **WHEN** 用户执行 `cozybase mcp`
- **AND** 本地 daemon 正在运行（`daemon.pid` 存在且进程存活）
- **THEN** 系统启动 MCP Server，通过 HTTP 连接到本地 daemon（`http://127.0.0.1:{port}`）

#### Scenario: 启动 MCP Server（指定远程 URL）

- **WHEN** 用户执行 `cozybase mcp --url http://homelab:2765`
- **THEN** 系统启动 MCP Server，通过 HTTP 连接到指定 URL 的 daemon

#### Scenario: 启动 MCP Server（无 daemon 运行且未指定 URL）

- **WHEN** 用户执行 `cozybase mcp`
- **AND** 本地 daemon 未运行（`daemon.pid` 不存在或进程已死）
- **AND** 未提供 `--url` 参数
- **THEN** 系统 SHALL 输出错误信息到 stderr，说明需要先启动 daemon 或指定 `--url`
- **AND** 系统 SHALL 以退出码 1 退出

#### Scenario: 初始化 Workspace

- **WHEN** 用户执行 `cozybase init`
- **THEN** 系统初始化当前目录为 Agent Workspace，复制模板文件

#### Scenario: 未识别的子命令

- **WHEN** 用户执行 `cozybase foo`
- **THEN** 系统显示帮助信息并以非零退出码退出
