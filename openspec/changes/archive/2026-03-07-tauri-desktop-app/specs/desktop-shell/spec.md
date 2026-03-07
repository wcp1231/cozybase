## ADDED Requirements

### Requirement: Tauri 桌面壳加载 CozyBase 主界面
系统 SHALL 在 macOS 上提供基于 Tauri 的桌面应用壳。应用启动时 SHALL 先创建主窗口并加载本地 loading 页面；当 Daemon 健康检查成功后，主窗口 SHALL 导航到 `http://localhost:{port}`。桌面壳 MUST NOT 内嵌前端构建产物，而是通过 WebView 直接访问 Daemon 暴露的 HTTP 服务。

#### Scenario: Daemon 就绪后跳转到主界面
- **WHEN** 用户启动桌面应用且 Daemon 在健康检查窗口内成功启动
- **THEN** 系统 SHALL 先展示 loading 页面
- **AND** 在确认 `daemon.port` 对应端口可用后，将主窗口导航到 `http://localhost:{port}`

### Requirement: 桌面壳支持原生通知
桌面应用 SHALL 支持 macOS 原生通知，用于提示 Daemon 异常和 Agent 任务完成等关键事件。通知内容 SHALL 包含事件摘要，并允许用户通过通知回到应用。

#### Scenario: Daemon 异常时发送通知
- **WHEN** 桌面应用检测到 Daemon 健康检查失败或异常退出
- **THEN** 系统 SHALL 发送一条 macOS 原生通知，提示 Daemon 异常

#### Scenario: Agent 任务完成时发送通知
- **WHEN** 桌面应用收到 Agent 任务完成事件
- **THEN** 系统 SHALL 发送一条 macOS 原生通知，提示任务已完成
