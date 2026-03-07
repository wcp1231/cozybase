## ADDED Requirements

### Requirement: 桌面模式自动准备默认 workspace
桌面应用 SHALL 在启动时自动解析默认 workspace 目录，并在缺失时自动创建。默认 workspace 路径 SHALL 为用户主目录下的 `~/.cozybase`。桌面模式 MUST NOT 要求用户先执行 `cozybase init` 才能启动应用或 Daemon。

#### Scenario: 首次启动时自动创建 workspace
- **WHEN** 用户首次启动桌面应用
- **AND** 用户主目录下不存在 `~/.cozybase`
- **THEN** 系统 SHALL 自动创建 `~/.cozybase` 及运行所需的基础目录
- **AND** SHALL 在 workspace 准备完成后继续执行 Daemon 启动流程

### Requirement: 桌面模式统一使用 workspace 中的 Daemon 状态文件
桌面应用与 Daemon 在桌面模式下 SHALL 统一使用同一个 workspace 目录来解析 `daemon.pid` 和 `daemon.port` 文件。桌面应用通过 sidecar 启动 Daemon 时 SHALL 将解析后的 workspace 路径传递给 Daemon，确保双方对 PID 和端口状态的读写一致。

#### Scenario: 桌面应用将 workspace 路径传给 Daemon
- **WHEN** 桌面应用通过 sidecar 启动 Daemon
- **THEN** 系统 SHALL 将默认 workspace 路径通过运行时上下文传给 Daemon
- **AND** Daemon SHALL 在该路径下读写 `daemon.pid` 和 `daemon.port`
