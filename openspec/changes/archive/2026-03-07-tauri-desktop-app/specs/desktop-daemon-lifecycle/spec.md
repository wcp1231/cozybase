## ADDED Requirements

### Requirement: 桌面应用负责 Daemon 启动与复用
桌面应用 SHALL 在启动时负责检测、复用或拉起 Daemon。系统 SHALL 先读取 workspace 下的 `daemon.pid` 与 `daemon.port` 文件；若对应进程仍存活且健康检查通过，则 SHALL 复用现有 Daemon；否则 SHALL 启动新的 Daemon 进程并等待其写出可用端口。

#### Scenario: 已有健康 Daemon 时直接复用
- **WHEN** 用户启动桌面应用
- **AND** workspace 中的 `daemon.pid` 指向存活进程
- **AND** `http://localhost:{port}/health` 返回成功
- **THEN** 系统 SHALL 复用现有 Daemon
- **AND** MUST NOT 再启动第二个 Daemon 进程

#### Scenario: 无可用 Daemon 时自动启动
- **WHEN** 用户启动桌面应用
- **AND** `daemon.pid` 不存在、对应进程不存在，或健康检查失败
- **THEN** 系统 SHALL 自动启动新的 Daemon 进程
- **AND** SHALL 在端口可用后再加载主界面

### Requirement: 桌面应用负责 Daemon 重启与退出关闭
桌面应用 SHALL 管理 Daemon 的重启和关闭。当用户执行 `Restart Daemon` 时，系统 SHALL 停止当前 Daemon 并重新启动；当用户退出桌面应用时，系统 SHALL 优雅关闭由桌面应用管理的 Daemon，超时后再强制终止。

#### Scenario: 用户从托盘重启 Daemon
- **WHEN** 用户点击托盘菜单中的 `Restart Daemon`
- **THEN** 系统 SHALL 停止当前 Daemon 进程
- **AND** SHALL 启动新的 Daemon 进程

#### Scenario: 用户退出应用时关闭 Daemon
- **WHEN** 用户点击托盘菜单中的 `Quit`
- **THEN** 系统 SHALL 向 Daemon 发送终止信号并等待其优雅退出
- **AND** 在超过超时时间后 SHALL 强制结束仍未退出的 Daemon 进程
