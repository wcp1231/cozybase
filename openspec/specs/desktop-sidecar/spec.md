# Desktop Sidecar

## Purpose

定义桌面应用如何打包并使用 Bun sidecar 来启动 Daemon bundle。

## Requirements

### Requirement: 桌面应用内嵌 Bun sidecar

桌面应用 SHALL 将 Bun 运行时作为 sidecar 二进制打包进应用包体，使用户在未预装 Bun 的 macOS 环境中也能启动 CozyBase。Daemon 启动时 SHALL 使用该 sidecar Bun，而不是依赖系统 PATH 中的 `bun`。

#### Scenario: 未安装 Bun 的机器上首次启动

- **WHEN** 用户在未安装 Bun 的 macOS 设备上启动桌面应用
- **THEN** 系统 SHALL 使用应用内嵌的 Bun sidecar 启动 Daemon
- **AND** MUST NOT 要求用户额外安装 Bun

### Requirement: Sidecar 启动时注入 Bun 与 workspace 上下文

桌面应用通过 sidecar 启动 Daemon 时 SHALL 注入 `COZYBASE_BUN_PATH` 和 `COZYBASE_WORKSPACE` 等运行时上下文。Daemon 内部所有需要调用 Bun 的逻辑 SHALL 优先使用 `COZYBASE_BUN_PATH` 指向的可执行文件路径。

#### Scenario: Sidecar 启动 Daemon bundle

- **WHEN** 桌面应用准备启动 Daemon
- **THEN** 系统 SHALL 使用 sidecar Bun 执行打包后的 Daemon bundle
- **AND** SHALL 为该进程注入 `COZYBASE_BUN_PATH` 与 `COZYBASE_WORKSPACE`

#### Scenario: Daemon 内部子进程复用 sidecar Bun

- **WHEN** Daemon 内部需要执行依赖 `bun` 的命令
- **THEN** 系统 SHALL 优先使用 `COZYBASE_BUN_PATH` 指定的 Bun 路径，而不是硬编码 `bun`
