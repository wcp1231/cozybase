## Why

CozyBase 目前仅以 Daemon + 浏览器的形式运行，缺乏桌面原生体验。引入 Tauri 构建桌面应用版本，可以提供系统托盘常驻、单实例保护、原生通知等能力，提升日常使用的便捷性。MVP 阶段仅支持 macOS 平台。

## What Changes

- 新增 `packages/desktop` 包，基于 Tauri v2 构建桌面应用壳
- Tauri 通过 Sidecar 机制内嵌 Bun 二进制，用户无需预装 Bun 运行时
- Tauri 负责管理 Daemon 进程生命周期（启动、健康检查、退出时关闭）
- 支持系统托盘常驻，提供快速访问菜单（打开面板、Daemon 状态、重启、退出）
- 支持单实例运行，防止多实例数据冲突
- 支持 macOS 原生通知（Daemon 异常、Agent 任务完成等）
- WebView 直接加载 Daemon HTTP 服务（localhost:3000），不内嵌前端产物
- 日常开发仍以 Web 版本为主，Tauri 仅用于打包测试和发布
- 通过 GitHub Release 分发 macOS .dmg 安装包

## Capabilities

### New Capabilities
- `desktop-shell`: Tauri 桌面应用壳，包括窗口管理、WebView 加载、应用打包
- `desktop-tray`: 系统托盘功能，包括常驻菜单、状态指示、快速操作
- `desktop-daemon-lifecycle`: Tauri 侧的 Daemon 进程管理，包括启动、健康检查、退出关闭
- `desktop-sidecar`: Bun 运行时 Sidecar 嵌入，确保用户零依赖运行
- `desktop-single-instance`: 单实例锁定，防止多实例同时运行

### Modified Capabilities
- `workspace-init`: Daemon 进程管理相关的 PID/port 文件路径需要支持从 Sidecar 上下文中正确解析

## Impact

- **新增依赖**: Tauri v2 (Rust)、tauri-plugin-single-instance、tauri-plugin-notification、tauri-plugin-shell (sidecar)
- **项目结构**: 新增 `packages/desktop/` 目录，包含 `src-tauri/` (Rust) 和 Tauri 配置
- **构建系统**: 需要 Rust 工具链（rustc、cargo）用于 Tauri 编译；新增 `tauri build` 构建流程
- **Daemon 代码**: `Bun.spawn(['bun', 'install'])` 等硬编码 bun 路径的调用需要支持通过环境变量或配置指定 bun 二进制路径，以兼容 Sidecar 场景
- **分发产物**: macOS .dmg / .app bundle，包体约 50-60MB（含 Bun sidecar）
