# Desktop Tray

## Purpose

定义 CozyBase 桌面应用的系统托盘入口、窗口隐藏行为与退出入口。

## Requirements

### Requirement: 桌面应用提供系统托盘入口

桌面应用 SHALL 提供系统托盘，并在托盘菜单中暴露 `Open CozyBase`、Daemon 状态、`Restart Daemon` 和 `Quit` 操作。托盘状态项 SHALL 反映当前 Daemon 的运行状态，且系统 SHALL 根据健康状态切换托盘图标。

#### Scenario: 用户通过托盘打开主窗口

- **WHEN** 用户点击托盘菜单中的 `Open CozyBase`
- **THEN** 系统 SHALL 显示并聚焦主窗口

#### Scenario: 托盘显示 Daemon 运行状态

- **WHEN** Daemon 健康检查通过
- **THEN** 托盘菜单 SHALL 显示 `Daemon: Running`
- **AND** 托盘图标 SHALL 显示健康状态

### Requirement: 关闭主窗口时应用继续常驻

用户点击主窗口关闭按钮时，桌面应用 SHALL 隐藏窗口并继续在系统托盘常驻。系统 MUST NOT 在窗口关闭时直接退出应用，除非用户显式选择 `Quit`。

#### Scenario: 点击关闭按钮时仅隐藏窗口

- **WHEN** 用户点击主窗口关闭按钮
- **THEN** 系统 SHALL 隐藏主窗口
- **AND** 应用 SHALL 继续保留托盘图标和菜单

#### Scenario: 用户从托盘退出应用

- **WHEN** 用户点击托盘菜单中的 `Quit`
- **THEN** 系统 SHALL 执行应用退出流程
