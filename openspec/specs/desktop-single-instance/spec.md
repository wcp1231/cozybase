# Desktop Single Instance

## Purpose

定义 CozyBase 桌面应用的单实例约束与第二实例拉起行为。

## Requirements

### Requirement: 桌面应用限制为单实例运行

桌面应用 SHALL 保证同一用户会话内仅允许一个 CozyBase 桌面实例运行。当第二个实例被启动时，系统 SHALL 通知首个实例并将其主窗口显示到前台，随后第二个实例 SHALL 退出。

#### Scenario: 第二个实例启动时聚焦已有窗口

- **WHEN** 用户在已有 CozyBase 桌面实例运行时再次启动应用
- **THEN** 系统 SHALL 将已有实例的主窗口显示并聚焦
- **AND** 新启动的实例 SHALL 立即退出
